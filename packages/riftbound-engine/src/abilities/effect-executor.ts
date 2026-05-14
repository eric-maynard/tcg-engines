/**
 * Effect Executor
 *
 * Executes ability effects by resolving targets and applying
 * game state mutations.
 */

import type {
  CardId as CoreCardId,
  PlayerId as CorePlayerId,
  ZoneId as CoreZoneId,
} from "@tcg/core";
import type { GrantedKeyword, RiftboundCardMeta, RiftboundGameState } from "../types";
import { computeEffectiveMight, getGlobalCardRegistry } from "../operations/card-lookup";
import { hasPlayerWonStrict } from "../game-definition/win-conditions/victory";
import { applyPrevent, combinePreventValues } from "../operations/prevent-damage";
import { checkReplacement, markReplacementConsumed } from "./replacement-effects";
import type { TargetDescriptor } from "./target-resolver";
import { resolveTarget } from "./target-resolver";

/**
 * Simplified effect interface for execution.
 */
export interface ExecutableEffect {
  readonly type: string;
  readonly amount?: number | Record<string, unknown>;
  readonly target?: TargetDescriptor;
  readonly duration?: string;
  readonly token?: { name: string; type: string; might?: number; keywords?: string[] };
  readonly location?: string;
  readonly description?: string;
  readonly effects?: ExecutableEffect[];
  /** For attach effect: the equipment to attach */
  readonly equipment?: TargetDescriptor;
  /** For attach effect: the unit to attach to */
  readonly to?: TargetDescriptor;
  /** For detach: ready state override */
  readonly ready?: boolean;
  /** For grant-keyword: the keyword to grant */
  readonly keyword?: string;
  /** For grant-keywords: multiple keywords */
  readonly keywords?: string[];
  /** For grant-keyword: optional numeric value */
  readonly value?: number;
  /** For add-resource: energy amount */
  readonly energy?: number;
  /** For add-resource: power domains */
  readonly power?: string[];
  /** For heal: player specifier */
  readonly player?: string;
  /** For swap-might: the first unit (target1) and second unit (target2). */
  readonly target1?: TargetDescriptor;
  readonly target2?: TargetDescriptor;
  /** For play / from-source effects: source zone descriptor. */
  readonly from?: string;
  /** For reveal-hand: optional override of who reveals (and filter on the hand). */
  readonly revealer?: string;
  readonly filter?: { excludeCardTypes?: string[]; [k: string]: unknown };
  readonly onPicked?: "recycle" | "banish" | "discard";
  /** For add-restriction / remove-restriction effects */
  readonly restriction?: string;
  /** For if/conditional effects */
  readonly condition?: unknown;
  /** For sequence/then effects */
  readonly then?: ExecutableEffect;
  /** For conditional effects: the branch executed when the condition is false. */
  readonly else?: ExecutableEffect;
}

/**
 * Context for effect execution.
 */
export interface EffectContext {
  readonly playerId: string;
  readonly sourceCardId: string;
  readonly sourceZone?: string;
  readonly draft: RiftboundGameState;
  /**
   * Named variables bound at the moment this effect resolves.
   *
   * Used for X-cost spells (e.g., Bullet Time): when a player chooses an
   * X value at play time, the engine stores it here as `{ x: N }` so that
   * effects referencing `{ variable: "x" }` in their amount expression can
   * read the chosen value during resolution.
   */
  readonly variables?: Record<string, number>;
  readonly zones: {
    moveCard: (params: {
      cardId: CoreCardId;
      targetZoneId: CoreZoneId;
      position?: "top" | "bottom" | number;
    }) => void;
    drawCards: (params: {
      count: number;
      from: CoreZoneId;
      to: CoreZoneId;
      playerId: CorePlayerId;
    }) => void;
    getCardsInZone: (zoneId: CoreZoneId, playerId?: CorePlayerId) => CoreCardId[];
    getCardZone: (cardId: CoreCardId) => string | undefined;
    /**
     * Shuffle a zone in place. Optional: not every test harness wires it up;
     * the Burn Out path falls back to "no shuffle" when missing, but real
     * games (which supply `shuffleZone` via the core `RuleEngine` zone ops)
     * randomize the deck per rule 431.2.b.
     */
    shuffleZone?: (zoneId: CoreZoneId, playerId?: CorePlayerId) => void;
  };
  readonly cards: {
    getCardOwner: (cardId: CoreCardId) => string | undefined;
    /**
     * Read the current controller of a card. Falls back to owner when the
     * underlying engine doesn't expose a separate controller view.
     */
    getCardController?: (cardId: CoreCardId) => string | undefined;
    /**
     * Mutate the controller of a card. Used by `take-control` (rule 187/323.6,
     * Hostile Takeover) and any future control-change effects. The change is
     * applied to the live `controller` field on the card instance — separate
     * from `owner` — so combat / scoring / hold checks immediately see the
     * new controller. If not provided, `take-control` is a no-op.
     */
    setCardController?: (cardId: CoreCardId, controllerId: string) => void;
    getCardMeta?: (cardId: CoreCardId) => Record<string, unknown> | undefined;
    updateCardMeta?: (cardId: CoreCardId, meta: Record<string, unknown>) => void;
  };
  readonly counters: {
    setFlag: (cardId: CoreCardId, flag: string, value: boolean) => void;
    addCounter: (cardId: CoreCardId, counter: string, amount: number) => void;
    removeCounter: (cardId: CoreCardId, counter: string, amount: number) => void;
    clearCounter: (cardId: CoreCardId, counter: string) => void;
  };
  /**
   * Create a new card instance directly in a zone.
   * Used for token creation (rule 170-178).
   * If not provided, create-token effects are silently skipped.
   */
  readonly createCardInZone?: (cardId: string, zoneId: string, ownerId: string) => void;
  /**
   * Fire triggers for a game event.
   * If not provided, trigger-dependent effects (become-mighty) are silently skipped.
   */
  readonly fireTriggers?: (event: import("./game-events").GameEvent) => void;
}

/**
 * Resolve targets for an effect using the target resolver.
 */
function getTargetIds(effect: ExecutableEffect, ctx: EffectContext): string[] {
  return resolveTarget(effect.target, {
    cards: ctx.cards,
    draft: ctx.draft,
    playerId: ctx.playerId,
    sourceCardId: ctx.sourceCardId,
    sourceZone: ctx.sourceZone,
    zones: ctx.zones,
  });
}

/** Mighty threshold — units with Might >= 5 are "Mighty" */
const MIGHTY_THRESHOLD = 5;

/**
 * Calculate a unit's effective Might from its definition and metadata.
 */
function getEffectiveMight(cardId: string, ctx: EffectContext): number {
  const registry = getGlobalCardRegistry();
  const def = registry.get(cardId);
  const baseMight = def?.might ?? 0;
  if (baseMight === 0) {
    return 0;
  } // Not a unit

  const meta = ctx.cards.getCardMeta?.(cardId as CoreCardId) as
    | Partial<RiftboundCardMeta>
    | undefined;
  const buffBonus = meta?.buffed ? 1 : 0;
  const mightMod = meta?.mightModifier ?? 0;
  const combatMightMod = meta?.combatMightModifier ?? 0;
  const staticBonus = meta?.staticMightBonus ?? 0;

  let equipBonus = 0;
  for (const equipId of meta?.equippedWith ?? []) {
    equipBonus += registry.getMightBonus(equipId);
  }

  return Math.max(0, baseMight + buffBonus + mightMod + combatMightMod + staticBonus + equipBonus);
}

/**
 * Resolve an AmountExpression to a numeric value.
 *
 * Handles dynamic amounts like "equal to this unit's Might",
 * "number of cards in hand", "number of cards in trash", or "count of matching targets".
 */
function resolveAmount(amount: number | Record<string, unknown>, ctx: EffectContext): number {
  if (typeof amount === "number") {
    return amount;
  }

  // Handle AmountExpression objects
  if ("might" in amount) {
    const target = amount.might as string;
    if (target === "self") {
      return getEffectiveMight(ctx.sourceCardId, ctx);
    }
  }
  if ("cardsInHand" in amount) {
    const whose = amount.cardsInHand as string;
    const pid =
      whose === "opponent"
        ? (Object.keys(ctx.draft.players).find((p) => p !== ctx.playerId) ?? ctx.playerId)
        : ctx.playerId;
    return ctx.zones.getCardsInZone("hand" as CoreZoneId, pid as CorePlayerId).length;
  }
  if ("cardsInTrash" in amount) {
    const whose = amount.cardsInTrash as string;
    const pid =
      whose === "opponent"
        ? (Object.keys(ctx.draft.players).find((p) => p !== ctx.playerId) ?? ctx.playerId)
        : ctx.playerId;
    return ctx.zones.getCardsInZone("trash" as CoreZoneId, pid as CorePlayerId).length;
  }
  if ("count" in amount) {
    // Count matching targets
    const target = amount.count as TargetDescriptor;
    return resolveTarget(target, {
      cards: ctx.cards,
      draft: ctx.draft,
      playerId: ctx.playerId,
      sourceCardId: ctx.sourceCardId,
      sourceZone: ctx.sourceZone,
      zones: ctx.zones,
    }).length;
  }
  if ("variable" in amount) {
    // Named variable bound at effect entry — e.g., X-cost spells
    // Store the chosen X value in ctx.variables.x and reference it here
    const name = amount.variable as string;
    return ctx.variables?.[name] ?? 0;
  }
  return 0;
}

/**
 * Check if a Might change crosses the Mighty threshold upward,
 * and fire the "become-mighty" trigger if so.
 * Returns true if the trigger fired.
 */
function checkBecomesMighty(cardId: string, mightBefore: number, ctx: EffectContext): boolean {
  const mightAfter = getEffectiveMight(cardId, ctx);
  if (mightBefore < MIGHTY_THRESHOLD && mightAfter >= MIGHTY_THRESHOLD) {
    // Fire become-mighty trigger if fireTriggers is available
    if (ctx.fireTriggers) {
      const owner = ctx.cards.getCardOwner(cardId as CoreCardId) ?? "";
      ctx.fireTriggers({ cardId, owner, type: "become-mighty" });
    }
    return true;
  }
  return false;
}

/**
 * Rule 715 — Bonus Damage. Scan the *controller's* board permanents for any
 * static ability whose effect is shaped like
 *
 *   { type: "static", effect: { type: "deal-bonus-damage", amount: N,
 *       condition?: {…}, source?: "spell" | "ability" | "any" } }
 *
 * and return the sum of `amount`s that apply to a damage emission from
 * `sourceCardId` controlled by `playerId`. Rule 715.2: applies per target,
 * so the caller multiplies nothing — it just adds the returned bonus to
 * each per-target damage amount inside the per-target loop.
 *
 * Rule 715.3 / 715.4: the bonus is applied BEFORE Prevent / replacement, so
 * the caller invokes this on the raw `amount` and feeds the bumped amount
 * into the per-target prevent/replacement pipeline.
 *
 * Generic: no per-card if-statements. Static abilities whose `effect.type ===
 * "deal-bonus-damage"` opt in automatically by virtue of being on the board.
 */
function getBonusDamage(
  sourceCardId: string,
  sourceKind: "spell" | "ability",
  controllerId: string,
  ctx: EffectContext,
): number {
  const registry = getGlobalCardRegistry();
  let bonus = 0;
  // Scan controller's board zones (base + legendZone + championZone +
  // Every battlefield zone). We use the same zones the static-abilities
  // Pass scans (rule 463 — statics fire from the board).
  const zonesToScan: string[] = ["base", "legendZone", "championZone"];
  for (const bfId of Object.keys(ctx.draft.battlefields)) {
    zonesToScan.push(`battlefield-${bfId}`);
  }
  zonesToScan.push("battlefieldRow");

  for (const zoneId of zonesToScan) {
    const ids = ctx.zones.getCardsInZone(zoneId as CoreZoneId);
    for (const cardId of ids) {
      // Only the controller's permanents grant the bonus ("YOUR spells and
      // Abilities deal 1 Bonus Damage").
      const cardController =
        ctx.cards.getCardController?.(cardId as CoreCardId) ??
        ctx.cards.getCardOwner(cardId as CoreCardId);
      if (cardController !== controllerId) {
        continue;
      }
      const abilities = registry.getAbilities(cardId as string) ?? [];
      for (const ability of abilities) {
        if ((ability as { type?: string }).type !== "static") {
          continue;
        }
        const {effect} = (ability as { effect?: Record<string, unknown> });
        if (!effect || (effect as { type?: string }).type !== "deal-bonus-damage") {
          continue;
        }
        // Optional `source` filter on the static — "spell" / "ability" /
        // "any" (default). If omitted, applies to both.
        const filterSrc = (effect as { source?: string }).source ?? "any";
        if (filterSrc !== "any" && filterSrc !== sourceKind) {
          continue;
        }
        // Optional condition gate.
        const cond = (ability as { condition?: Record<string, unknown> }).condition;
        if (cond && !evaluateEffectCondition(cond, ctx)) {
          continue;
        }
        const amt = (effect as { amount?: number }).amount ?? 0;
        bonus += amt;
      }
    }
  }
  // Mark `sourceCardId` as used so eslint doesn't flag the unused param —
  // Future refinements (per-source filter) will read this.
  void sourceCardId;
  // Rule 714.1 — "Bonus Damage can only be a positive value, and can only
  // Increase the amount of Damage being distributed."
  // Rule 714.2 — "If, for any reason, Bonus Damage would be a negative
  // Number, then no Bonus Damage is applied to the action." A static could
  // Grant a negative `deal-bonus-damage` (e.g. "your spells deal 1 less
  // Bonus damage") — once summed with positive grants the net could fall
  // Below zero. Clamp to ≥ 0 so the multi-source sum still satisfies the
  // Glossary: zero net contribution, not a damage reduction.
  return Math.max(0, bonus);
}

/**
 * Evaluate a condition for conditional effects.
 */
export function evaluateEffectCondition(
  condition: Record<string, unknown>,
  ctx: EffectContext,
): boolean {
  const condType = condition.type as string;
  switch (condType) {
    case "has-xp": {
      const threshold = (condition.threshold as number) ?? 1;
      const player = ctx.draft.players[ctx.playerId];
      return (player?.xp ?? 0) >= threshold;
    }
    case "controls-unit": {
      // "Do I control a unit?" must scan every board zone (rule 187 — control
      // Is over board game-objects, not just base; a player whose only units
      // Are at battlefields still CONTROLS units). Previously this only
      // Looked at the base zone, so an effect gated on "if you control a
      // Unit" silently fizzled for any player with their whole army at
      // Battlefields. We scan `base` + every `battlefield-*` zone and ask
      // The registry whether each ID is a unit when the registry knows;
      // When the registry has no entry (mock/test contexts that don't pre-
      // Register a def), we fall back to the original permissive behavior
      // Of treating any card in the zone as a candidate. Filtering by
      // Controller uses `getCardController` when exposed (live engine),
      // Else `getCardOwner` (test stubs).
      const registry = getGlobalCardRegistry();
      const hasUnitIn = (zoneId: string, pid?: string): boolean => {
        const ids = ctx.zones.getCardsInZone(
          zoneId as CoreZoneId,
          pid as CorePlayerId | undefined,
        );
        if (ids.length === 0) {
          return false;
        }
        // If the test context can't tell us controller/owner at all, fall
        // Back to the original "any card in my base => yes" check.
        if (!ctx.cards.getCardOwner && !ctx.cards.getCardController) {
          return ids.length > 0;
        }
        return ids.some((id) => {
          const def = registry.get(id as string);
          // Unknown def: be permissive (don't break mocks that omit defs).
          if (def && def.cardType !== "unit") {
            return false;
          }
          const controller = ctx.cards.getCardController?.(id as CoreCardId);
          const owner = ctx.cards.getCardOwner(id as CoreCardId);
          // For base-zone lookups the caller already filtered by player,
          // So any card returned belongs to the player. For battlefield
          // Sweeps the zone is shared — match on controller/owner.
          if (pid !== undefined) {
            return true;
          }
          return (controller ?? owner) === ctx.playerId;
        });
      };
      if (hasUnitIn("base", ctx.playerId)) {
        return true;
      }
      for (const bfId of Object.keys(ctx.draft.battlefields)) {
        if (hasUnitIn(`battlefield-${bfId}`)) {
          return true;
        }
      }
      return false;
    }
    case "score-within": {
      const range = (condition.range as number) ?? 0;
      const { victoryScore } = ctx.draft;
      for (const pid of Object.keys(ctx.draft.players)) {
        if (pid !== ctx.playerId) {
          const score = ctx.draft.players[pid]?.victoryPoints ?? 0;
          if (Math.abs(victoryScore - score) <= range) {
            return true;
          }
        }
      }
      return false;
    }
    default: {
      return true;
    }
  }
}

/**
 * Execute a single effect.
 */
export function executeEffect(effect: ExecutableEffect, ctx: EffectContext): void {
  switch (effect.type) {
    case "draw": {
      const rawDrawCount = effect.amount ?? 1;
      const drawCount =
        typeof rawDrawCount === "number" ? rawDrawCount : resolveAmount(rawDrawCount, ctx);
      for (let i = 0; i < drawCount; i++) {
        // Check if deck is empty → Burn Out (rule 431, fka 518)
        const deckCards = ctx.zones.getCardsInZone(
          "mainDeck" as CoreZoneId,
          ctx.playerId as CorePlayerId,
        );
        if (deckCards.length === 0) {
          // Rule 431.2.b — Recycle the trash into the Main Deck. "When
          // Multiple cards are Recycled to the Main Deck at the same time,
          // Those cards must be randomized." Previously the trash cards
          // Were moved one-by-one into the deck IN TRASH ORDER and never
          // Shuffled — a deterministic, exploitable order. We now (1) move
          // Them, then (2) call `shuffleZone` if the host provides it
          // (the real engine does; some test stubs don't, in which case
          // We keep the move-only fallback). Same fix in the per-turn
          // Draw-phase Burn Out (`riftbound-flow.ts`).
          const trashCards = ctx.zones.getCardsInZone(
            "trash" as CoreZoneId,
            ctx.playerId as CorePlayerId,
          );
          for (const cardId of trashCards) {
            ctx.zones.moveCard({
              cardId,
              targetZoneId: "mainDeck" as CoreZoneId,
            });
          }
          ctx.zones.shuffleZone?.(
            "mainDeck" as CoreZoneId,
            ctx.playerId as CorePlayerId,
          );
          // Rule 431.2.c — chosen opponent gains 1 point. For 2-player
          // Games the choice is forced; in multi-player goldfish runs we
          // Give the point to each opponent in turn order (the engine's
          // Multi-player chooser is the caller's concern). Rule 431.3.a:
          // If that pushes them to the Victory Score, they WIN immediately
          // — previously this branch never even checked, so a Burn Out
          // That handed the opponent their winning point silently kept
          // Playing.
          for (const opponentId of Object.keys(ctx.draft.players)) {
            if (opponentId !== ctx.playerId) {
              const opponent = ctx.draft.players[opponentId];
              if (opponent) {
                opponent.victoryPoints += 1;
                if (hasPlayerWonStrict(ctx.draft, opponentId)) {
                  // The state type is `readonly`-decorated for safety; the
                  // Engine still mutates it in place inside reducers/effects
                  // (see `moves/combat.ts`, where the same fields are written
                  // Through the unfrozen `draft`). Cast away the readonly so
                  // The live mutation goes through; the test harness's
                  // `liveExecContext.draft = internal.currentState` and the
                  // Real engine's draft both accept it.
                  (ctx.draft as { status: string }).status = "finished";
                  (ctx.draft as { winner: string }).winner = opponentId;
                  return;
                }
              }
            }
          }
          // If deck is still empty after burn out, can't draw
          const refreshedDeck = ctx.zones.getCardsInZone(
            "mainDeck" as CoreZoneId,
            ctx.playerId as CorePlayerId,
          );
          if (refreshedDeck.length === 0) {
            break;
          }
        }
        // Draw 1 card
        ctx.zones.drawCards({
          count: 1,
          from: "mainDeck" as CoreZoneId,
          playerId: ctx.playerId as CorePlayerId,
          to: "hand" as CoreZoneId,
        });
      }
      break;
    }

    case "damage": {
      const rawAmount = effect.amount ?? 1;
      const baseAmount =
        typeof rawAmount === "number"
          ? rawAmount
          : resolveAmount(rawAmount as Record<string, unknown>, ctx);
      // Rule 715.1/.2/.3 — Bonus Damage. Scan the source-card controller's
      // Statics for `deal-bonus-damage` and bump the per-target amount before
      // Prevent / replacement runs (rule 715.4). Per rule 715.2, the bonus
      // Applies to each target individually; we apply it inside the loop by
      // Computing the bumped amount up front and reusing it for every target
      // (each iteration uses the same value — rule 715.2 isn't "stack per
      // Target", it's "per-target each gets +N").
      // We infer the source kind from the source card type. If the registry
      // Knows the source is a spell, mark "spell"; otherwise treat as
      // "ability" (units/gear/legend statics-triggered).
      const damageRegistry = getGlobalCardRegistry();
      const sourceDef = damageRegistry.get(ctx.sourceCardId);
      const sourceKind: "spell" | "ability" =
        sourceDef?.cardType === "spell" ? "spell" : "ability";
      const damageBonus = getBonusDamage(ctx.sourceCardId, sourceKind, ctx.playerId, ctx);
      const amount = baseAmount + damageBonus;
      const targets = getTargetIds(effect, ctx);
      for (const targetId of targets) {
        // Rule 460.2.c.9 — a unit that cannot be dealt damage takes none
        // (the `damage` game action is a no-op against it).
        const targetMeta = ctx.cards.getCardMeta?.(targetId as CoreCardId) as
          | Partial<RiftboundCardMeta>
          | undefined;
        if (targetMeta?.cannotTakeDamage === true) {
          continue;
        }
        // Check for "take-damage" replacement effects
        const owner = ctx.cards.getCardOwner(targetId as CoreCardId) ?? "";
        const replacementCtx = {
          cards: {
            getCardMeta: ctx.cards.getCardMeta ?? (() => undefined),
            getCardOwner: ctx.cards.getCardOwner,
          },
          draft: ctx.draft,
          zones: { getCardsInZone: ctx.zones.getCardsInZone },
        };
        const replacement = checkReplacement(
          { amount, cardId: targetId, owner, type: "take-damage" },
          replacementCtx as Parameters<typeof checkReplacement>[1],
        );
        if (replacement) {
          // Damage was replaced (e.g., "prevent" or alternative effect)
          if (replacement.replacement !== "prevent" && replacement.replacement) {
            executeEffect(replacement.replacement as ExecutableEffect, ctx);
          }
          // Consume single-fire "next"-duration replacements so they don't
          // Re-trigger on subsequent damage events this turn.
          markReplacementConsumed(ctx.draft, replacement);
          continue;
        }
        // Rule 437 — Prevent. If a Prevent Value is tracked on the unit,
        // Reduce the dealt damage by it (never below 0) and reduce the
        // Tracked value by the prevented amount; expire it when it hits 0.
        const tracked = targetMeta?.preventDamage as number | "all" | undefined;
        const { dealt, remaining } = applyPrevent(amount, tracked);
        if (tracked !== undefined && remaining !== tracked) {
          ctx.cards.updateCardMeta?.(
            targetId as CoreCardId,
            { preventDamage: remaining } as unknown as Record<string, unknown>,
          );
        }
        if (dealt > 0) {
          ctx.counters.addCounter(targetId as CoreCardId, "damage", dealt);
          // Engine-bus event: damage was dealt (distinct from the
          // `take-damage` trigger event the replacement check used above).
          // Routed through the event-bus chokepoint; the event log / future
          // Listeners see it. Also surfaces as a `counterChanged` on the
          // Damage counter so SBA-input listeners have one shape to watch.
          ctx.fireTriggers?.({
            amount: dealt,
            cardId: targetId as string,
            sourceId: ctx.sourceCardId,
            type: "damageDealt",
          });
          ctx.fireTriggers?.({
            cardId: targetId as string,
            cause: "damage-effect",
            counter: "damage",
            delta: dealt,
            type: "counterChanged",
          });
        }
      }
      break;
    }

    case "kill": {
      const targets = getTargetIds(effect, ctx);
      for (const targetId of targets) {
        // Rule 571-575 / 428: a "kill" instruction is a "would die" event a
        // Replacement effect on the board can intercede on (Zhonya's Hourglass,
        // Tactical Retreat, Guardian Angel, …). When one applies, the unit is
        // Not trashed (the engine treats any matched die-replacement as "skip
        // The kill" — it doesn't yet run the replacement's own heal/exhaust/
        // Recall body); single-fire `"next"`-duration replacements are consumed.
        const killOwner = ctx.cards.getCardOwner(targetId as CoreCardId) ?? "";
        const killReplacementCtx = {
          cards: {
            getCardMeta: ctx.cards.getCardMeta ?? (() => undefined),
            getCardOwner: ctx.cards.getCardOwner,
          },
          draft: ctx.draft,
          zones: { getCardsInZone: ctx.zones.getCardsInZone },
        };
        const killReplacement = checkReplacement(
          { cardId: targetId as string, owner: killOwner, type: "die" },
          killReplacementCtx as Parameters<typeof checkReplacement>[1],
        );
        if (killReplacement) {
          markReplacementConsumed(ctx.draft, killReplacement);
          ctx.cards.updateCardMeta?.(
            targetId as CoreCardId,
            { damage: 0 } as unknown as Record<string, unknown>,
          );
          continue;
        }
        ctx.zones.moveCard({
          cardId: targetId as CoreCardId,
          targetZoneId: "trash" as CoreZoneId,
        });
      }
      break;
    }

    case "buff": {
      const targets = getTargetIds(effect, ctx);
      const buffTargets = targets.length === 0 ? [ctx.sourceCardId] : targets;
      for (const targetId of buffTargets) {
        // Enforce max 1 buff per unit (rule)
        const meta = ctx.cards.getCardMeta?.(targetId as CoreCardId) as
          | Partial<RiftboundCardMeta>
          | undefined;
        if (meta?.buffed) {
          continue; // Already buffed — skip
        }
        const mightBefore = getEffectiveMight(targetId, ctx);
        ctx.counters.setFlag(targetId as CoreCardId, "buffed", true);
        checkBecomesMighty(targetId, mightBefore, ctx);
      }
      break;
    }

    case "score": {
      // Rule 467 — "When a cleanup occurs and a player has accrued Points
      // Greater than or equal to the Victory Score for their Mode of Play,
      // And if they have more points than any opponent, they Win the Game."
      // The `combat`/`burnOut` paths already call `hasPlayerWon` after a
      // Point increment and set `status:"finished"` / `winner` if so. The
      // `score` effect previously incremented points but never checked,
      // Letting a spell that scored a player past the threshold leave the
      // Game in `playing` indefinitely until the next state-based pass.
      // Now: same check, same finishing semantics, no double-firing
      // (`hasPlayerWon` is idempotent — it just compares numbers).
      const amount = resolveAmount(effect.amount ?? 1, ctx);
      const player = ctx.draft.players[ctx.playerId];
      if (player) {
        player.victoryPoints += amount;
        if (hasPlayerWonStrict(ctx.draft, ctx.playerId)) {
          // Cast through the readonly façade — same pattern as the Burn Out
          // Path above (and `moves/combat.ts`); the runtime state is the
          // Mutable draft.
          (ctx.draft as { status: string }).status = "finished";
          (ctx.draft as { winner: string }).winner = ctx.playerId;
        }
      }
      break;
    }

    case "channel": {
      // Rule 515.3.a — Channel moves the top of the Rune Deck onto the board
      // As a ready Rune. The flow's per-turn Channel-phase hook routes this
      // To the `runePool` zone (see `riftbound-flow.ts` Channel onBegin —
      // "Channeled runes go to the runePool zone (not base, which is for
      // Units/gear). They enter ready and the player must Exhaust them via
      // The exhaustRune move to get energy."). Effect-driven `channel` (e.g.
      // An ability that channels an additional rune mid-turn) must do the
      // Same, not move the rune to `base` — `base` is the units-and-gear
      // Zone, and a rune sitting there is unreachable by the `exhaustRune`
      // Move that produces energy. Fixed: target `runePool` to match the
      // Per-turn channel.
      const count = resolveAmount(effect.amount ?? 1, ctx);
      for (let i = 0; i < count; i++) {
        const runes = ctx.zones.getCardsInZone(
          "runeDeck" as CoreZoneId,
          ctx.playerId as CorePlayerId,
        );
        if (runes[0]) {
          ctx.zones.moveCard({
            cardId: runes[0],
            targetZoneId: "runePool" as CoreZoneId,
          });
        }
      }
      break;
    }

    case "ready": {
      const targets = getTargetIds(effect, ctx);
      if (targets.length === 0) {
        ctx.counters.setFlag(ctx.sourceCardId as CoreCardId, "exhausted", false);
      } else {
        for (const targetId of targets) {
          ctx.counters.setFlag(targetId as CoreCardId, "exhausted", false);
        }
      }
      break;
    }

    case "exhaust": {
      const targets = getTargetIds(effect, ctx);
      if (targets.length === 0) {
        ctx.counters.setFlag(ctx.sourceCardId as CoreCardId, "exhausted", true);
      } else {
        for (const targetId of targets) {
          ctx.counters.setFlag(targetId as CoreCardId, "exhausted", true);
        }
      }
      break;
    }

    case "stun": {
      const targets = getTargetIds(effect, ctx);
      if (targets.length === 0) {
        ctx.counters.setFlag(ctx.sourceCardId as CoreCardId, "stunned", true);
      } else {
        for (const targetId of targets) {
          ctx.counters.setFlag(targetId as CoreCardId, "stunned", true);
        }
      }
      break;
    }

    case "recall": {
      const targets = getTargetIds(effect, ctx);
      if (targets.length === 0) {
        ctx.zones.moveCard({
          cardId: ctx.sourceCardId as CoreCardId,
          targetZoneId: "base" as CoreZoneId,
        });
      } else {
        for (const targetId of targets) {
          ctx.zones.moveCard({
            cardId: targetId as CoreCardId,
            targetZoneId: "base" as CoreZoneId,
          });
        }
      }
      break;
    }

    case "discard": {
      const count = resolveAmount(effect.amount ?? 1, ctx);
      const hand = ctx.zones.getCardsInZone("hand" as CoreZoneId, ctx.playerId as CorePlayerId);
      for (let i = 0; i < Math.min(count, hand.length); i++) {
        if (hand[i]) {
          ctx.zones.moveCard({
            cardId: hand[i],
            targetZoneId: "trash" as CoreZoneId,
          });
        }
      }
      break;
    }

    case "return-to-hand": {
      const targets = getTargetIds(effect, ctx);
      if (targets.length === 0) {
        ctx.zones.moveCard({
          cardId: ctx.sourceCardId as CoreCardId,
          targetZoneId: "hand" as CoreZoneId,
        });
      } else {
        for (const targetId of targets) {
          ctx.zones.moveCard({
            cardId: targetId as CoreCardId,
            targetZoneId: "hand" as CoreZoneId,
          });
        }
      }
      break;
    }

    case "win-game": {
      // Rule 632.4 — "Win the game" causes the resolving player to win
      // Immediately (sets the game status). Implementation: mark
      // `state.winner = playerId` and set `state.status = "ended"`. The
      // Public game-state shape uses `status` ("playing"|"ended") + a
      // `winner` field, both already used by the standard victory-score
      // Path; we just set them here too so listeners (UI, end-of-game
      // Hooks) observe the win regardless of whether it came from
      // Crossing the victory threshold or from a "win the game" effect
      // (e.g. The Grand Plaza, Crystal Spire).
      const winState = ctx.draft as RiftboundGameState & {
        status?: string;
        winner?: string;
      };
      if (winState.status !== "finished") {
        winState.status = "finished";
        winState.winner = ctx.playerId;
      }
      break;
    }

    case "double-might": {
      // Rule 432 (Doubling) — increase a numeric attribute by an amount equal
      // To its CURRENT value, applied as a single delta for the named
      // Duration. For Might, that means +current Might (so 5 becomes 10,
      // Tracked as a +5 modifier; shield-driven temporary +Might in current
      // Value also gets doubled per rule 432.1 example). Implemented as a
      // +effectiveMight delta on `mightModifier` (or `combatMightModifier`
      // For combat duration), so it reverts at the right cleanup boundary.
      const doubleTargets = getTargetIds(effect, ctx);
      const dDuration = (effect as unknown as { duration?: string }).duration;
      const dIsCombat = dDuration === "combat";
      for (const targetId of doubleTargets) {
        const currentMight = getEffectiveMight(targetId, ctx);
        if (currentMight <= 0) {
          continue;
        }
        const meta = ctx.cards.getCardMeta?.(targetId as CoreCardId) as
          | Partial<RiftboundCardMeta>
          | undefined;
        if (dIsCombat) {
          const curMod = meta?.combatMightModifier ?? 0;
          ctx.cards.updateCardMeta?.(
            targetId as CoreCardId,
            { combatMightModifier: curMod + currentMight } as unknown as Record<string, unknown>,
          );
        } else {
          const curMod = meta?.mightModifier ?? 0;
          ctx.cards.updateCardMeta?.(
            targetId as CoreCardId,
            { mightModifier: curMod + currentMight } as unknown as Record<string, unknown>,
          );
        }
        checkBecomesMighty(targetId, currentMight, ctx);
      }
      break;
    }

    case "swap-might": {
      // Rule 230 (Swap Might) — exchange the effective Might of two units
      // For the named duration. Implemented as equal-and-opposite deltas on
      // `mightModifier` (or `combatMightModifier` for `duration:"combat"`)
      // So that the swap is reverted by the same cleanup path that resets
      // Turn-scoped buffs (rule 517.2.b). The deltas are computed from the
      // Current EFFECTIVE Might of each target, so any prior modifiers are
      // Captured into the swap (Switcheroo on a Poro on a Brush battlefield:
      // The +1 from Brush is part of effective Might, so swapping captures
      // And exchanges that bonus too — rule 230).
      const swapEffect = effect as unknown as {
        target1?: TargetDescriptor;
        target2?: TargetDescriptor;
        duration?: "turn" | "permanent" | "combat";
      };
      const ids1 = resolveTarget(swapEffect.target1, {
        cards: ctx.cards,
        draft: ctx.draft,
        playerId: ctx.playerId,
        sourceCardId: ctx.sourceCardId,
        sourceZone: ctx.sourceZone,
        zones: ctx.zones,
      });
      const ids2 = resolveTarget(swapEffect.target2, {
        cards: ctx.cards,
        draft: ctx.draft,
        playerId: ctx.playerId,
        sourceCardId: ctx.sourceCardId,
        sourceZone: ctx.sourceZone,
        zones: ctx.zones,
      });
      const a = ids1[0];
      const b = ids2[0];
      if (a && b && a !== b) {
        const mightA = getEffectiveMight(a, ctx);
        const mightB = getEffectiveMight(b, ctx);
        const isCombat = swapEffect.duration === "combat";
        const fieldKey = isCombat
          ? ("combatMightModifier" as const)
          : ("mightModifier" as const);
        const metaA = (ctx.cards.getCardMeta?.(a as CoreCardId) ?? {}) as Partial<RiftboundCardMeta>;
        const metaB = (ctx.cards.getCardMeta?.(b as CoreCardId) ?? {}) as Partial<RiftboundCardMeta>;
        const curA = (metaA[fieldKey] as number | undefined) ?? 0;
        const curB = (metaB[fieldKey] as number | undefined) ?? 0;
        // After the swap, a should HAVE mightB and b should HAVE mightA.
        // So a's new total = mightB → delta_a = mightB - mightA.
        const deltaA = mightB - mightA;
        const deltaB = mightA - mightB;
        ctx.cards.updateCardMeta?.(
          a as CoreCardId,
          { [fieldKey]: curA + deltaA } as unknown as Record<string, unknown>,
        );
        ctx.cards.updateCardMeta?.(
          b as CoreCardId,
          { [fieldKey]: curB + deltaB } as unknown as Record<string, unknown>,
        );
        // Crossing the Mighty threshold can trigger "become-mighty" on either side.
        checkBecomesMighty(a, mightA, ctx);
        checkBecomesMighty(b, mightB, ctx);
      }
      break;
    }

    case "transform": {
      // Rule 230 / 300 — "This unit becomes [a 3M Demacian Sentinel]."
      // Re-register the target's card definition in the global card registry
      // (the runtime registry maps instance-id → definition, so this replaces
      // The printed face). What's ON the card — marked damage, attached
      // Gear, granted keywords, exhaustion — is preserved (rule 230 generally
      // Keeps existing meta). What's PRINTED — base might, energyCost,
      // Keywords, abilities — comes from the new definition. Static recalc
      // Runs through the dispatcher's `EVENT_TYPES_NEEDING_RECALC` set
      // (`buff`, `grant-keyword`, etc.) — fire `buff` to ensure recalc.
      const xform = effect as unknown as {
        target?: TargetDescriptor;
        newDefinition?: Record<string, unknown>;
        newCardName?: string;
      };
      const ids = resolveTarget(xform.target, {
        cards: ctx.cards,
        draft: ctx.draft,
        playerId: ctx.playerId,
        sourceCardId: ctx.sourceCardId,
        sourceZone: ctx.sourceZone,
        zones: ctx.zones,
      });
      const def = xform.newDefinition;
      if (def) {
        const registry = getGlobalCardRegistry();
        for (const targetId of ids) {
          // Preserve any printed-id reference field so the new shape still
          // Reads as "this card" for self-referential effects. The
          // `register` method overwrites — that's exactly what we want.
          registry.register(targetId, {
            id: (def.id as string | undefined) ?? targetId,
            ...def,
          } as Parameters<typeof registry.register>[1]);
          // Trigger a recalc by emitting a `buff` event (recalc-relevant)
          // So static abilities re-evaluate against the new definition's
          // Printed keywords/abilities.
          if (ctx.fireTriggers) {
            ctx.fireTriggers({
              amount: 0,
              cardId: targetId,
              playerId: ctx.playerId,
              type: "buff",
            } as unknown as Parameters<NonNullable<typeof ctx.fireTriggers>>[0]);
          }
        }
      }
      break;
    }

    case "copy-spell": {
      // Copy the most-recent (LIFO) spell currently on the chain and add the
      // Copy as a new chain item resolving for the COPYING player. The copy
      // Shares the original's effect AST, targets, and variables. No card is
      // Created — the chain item carries the effect directly. Rule 420 /
      // 555.x (copies are not "played" — they go on the chain as a copy).
      const {interaction} = ctx.draft;
      if (!interaction?.chain?.active) {
        break;
      }
      const {items} = interaction.chain;
      if (items.length === 0) {
        break;
      }
      // Find the top spell item (skip non-spell items like triggered abilities
      // If the caller meant "copy a spell" specifically).
      const onlySpell = (effect as unknown as { spellOnly?: boolean }).spellOnly !== false;
      let sourceItem: (typeof items)[number] | undefined;
      for (let i = items.length - 1; i >= 0; i--) {
        const it = items[i];
        if (!onlySpell || it.type === "spell") {
          sourceItem = it;
          break;
        }
      }
      if (!sourceItem) {
        break;
      }
      // Use addToChain via direct mutation of the draft's interaction state.
      // We can't import `addToChain` here without a circular reference, so
      // We mutate the chain items array directly — same shape `addToChain`
      // Produces. The copy's controller is the resolving player (the player
      // Whose effect copied the spell); its `cardId` mirrors the source so
      // Targeting/self-relative effects still resolve against the printed
      // Card; mark `triggered:false` so it doesn't re-check intervening-if.
      const draftInteraction = ctx.draft.interaction as unknown as {
        chain: {
          active: boolean;
          items: {
            id: string;
            cardId: string;
            controller: string;
            effect?: unknown;
            type: string;
            countered?: boolean;
            triggered?: boolean;
          }[];
          activePlayer: string;
          passedPlayers: string[];
        };
        nextChainItemId: number;
      };
      const newId = `chain-${draftInteraction.nextChainItemId}`;
      draftInteraction.nextChainItemId += 1;
      draftInteraction.chain.items.push({
        cardId: sourceItem.cardId,
        controller: ctx.playerId,
        effect: sourceItem.effect,
        id: newId,
        type: sourceItem.type,
      });
      // Reset priority to copier (they get to chain onto their own copy
      // First per rule 543.4 chain-priority model).
      draftInteraction.chain.activePlayer = ctx.playerId;
      draftInteraction.chain.passedPlayers = [];
      break;
    }

    case "copy-unit": {
      // Spawn a token clone of `target` — same name/might/abilities. Rule 420
      // — copies of units are tokens (rule 183.1: cease to exist when they
      // Leave the board). Implemented via the existing `create-token` path:
      // Build a token def from the source's registry entry, then delegate.
      const copyEffect = effect as unknown as {
        target?: TargetDescriptor;
        location?: string;
      };
      const sourceIds = resolveTarget(copyEffect.target, {
        cards: ctx.cards,
        draft: ctx.draft,
        playerId: ctx.playerId,
        sourceCardId: ctx.sourceCardId,
        sourceZone: ctx.sourceZone,
        zones: ctx.zones,
      });
      if (sourceIds.length === 0 || !ctx.createCardInZone) {
        break;
      }
      const sourceId = sourceIds[0];
      const sourceDef = getGlobalCardRegistry().get(sourceId);
      if (!sourceDef) {
        break;
      }
      let targetZone: string;
      if (copyEffect.location === "here" && ctx.sourceZone) {
        targetZone = ctx.sourceZone;
      } else if (copyEffect.location) {
        targetZone = copyEffect.location;
      } else {
        targetZone = "base";
      }
      const tokenId = `token-copy-${sourceId}-${Date.now()}`;
      ctx.createCardInZone(tokenId, targetZone, ctx.playerId);
      getGlobalCardRegistry().register(tokenId, {
        abilities: sourceDef.abilities,
        cardType: sourceDef.cardType ?? "unit",
        domain: sourceDef.domain,
        energyCost: sourceDef.energyCost,
        id: tokenId,
        isToken: true,
        keywords: sourceDef.keywords,
        might: sourceDef.might ?? 1,
        name: sourceDef.name,
        powerCost: sourceDef.powerCost,
      } as Parameters<ReturnType<typeof getGlobalCardRegistry>["register"]>[1]);
      break;
    }

    case "summon-token": {
      // Alias: same as `create-token` but accepts a named token reference
      // From the cards package's tokens registry (lookup by token name in
      // The global registry). If the named token's def exists, use it;
      // Else fall through to the generic `token` field (same as create-token).
      const summonEffect = effect as unknown as {
        token?: { name: string; might?: number; type?: string; keywords?: string[] };
        tokenName?: string;
        amount?: number;
        location?: string;
      };
      let tokenDef = summonEffect.token;
      if (!tokenDef && summonEffect.tokenName) {
        // Search the registry for a registered token def with this name.
        const registry = getGlobalCardRegistry();
        // The registry is private; we delegate by name via `get` if the
        // Caller used the name as id. If not found, build a vanilla token.
        const found = registry.get(summonEffect.tokenName);
        if (found) {
          tokenDef = {
            keywords: found.keywords,
            might: found.might ?? 1,
            name: found.name ?? summonEffect.tokenName,
            type: found.cardType === "gear" ? "gear" : "unit",
          };
        } else {
          tokenDef = {
            might: 1,
            name: summonEffect.tokenName,
            type: "unit",
          };
        }
      }
      if (!tokenDef || !ctx.createCardInZone) {
        break;
      }
      const count = resolveAmount(summonEffect.amount ?? 1, ctx);
      let targetZone: string;
      if (summonEffect.location === "here" && ctx.sourceZone) {
        targetZone = ctx.sourceZone;
      } else if (summonEffect.location) {
        targetZone = summonEffect.location;
      } else {
        targetZone = "base";
      }
      const registry = getGlobalCardRegistry();
      for (let i = 0; i < count; i++) {
        const tokenId = `token-${tokenDef.name.toLowerCase().replace(/\s+/g, "-")}-${Date.now()}-${i}`;
        ctx.createCardInZone(tokenId, targetZone, ctx.playerId);
        registry.register(tokenId, {
          cardType: tokenDef.type === "gear" ? "gear" : "unit",
          id: tokenId,
          isToken: true,
          keywords: tokenDef.keywords,
          might: tokenDef.might ?? 1,
          name: tokenDef.name,
        } as Parameters<typeof registry.register>[1]);
      }
      break;
    }

    case "swap-units": {
      // Rule 230 (Switcheroo-style position swap, p1819 Azir Ascendant) —
      // Exchange two units' zone+position so each occupies the other's spot.
      // Implementation: swap their zone assignments (base ↔ battlefield-X,
      // Battlefield-X ↔ battlefield-Y, …). Combat roles (rule 459.2.b) are
      // Cleared on the moved units so the next state-based-check pass / next
      // Combat-Cleanup re-derives them from the new positions per rule 323.2.
      // No per-card logic; works for any "swap two units" effect text.
      const swapEffect = effect as unknown as {
        a?: TargetDescriptor;
        b?: TargetDescriptor;
        target1?: TargetDescriptor;
        target2?: TargetDescriptor;
      };
      const targetA = swapEffect.a ?? swapEffect.target1;
      const targetB = swapEffect.b ?? swapEffect.target2;
      const idsA = resolveTarget(targetA, {
        cards: ctx.cards,
        draft: ctx.draft,
        playerId: ctx.playerId,
        sourceCardId: ctx.sourceCardId,
        sourceZone: ctx.sourceZone,
        zones: ctx.zones,
      });
      const idsB = resolveTarget(targetB, {
        cards: ctx.cards,
        draft: ctx.draft,
        playerId: ctx.playerId,
        sourceCardId: ctx.sourceCardId,
        sourceZone: ctx.sourceZone,
        zones: ctx.zones,
      });
      const a = idsA[0];
      const b = idsB[0];
      if (a && b && a !== b) {
        const zoneA = ctx.zones.getCardZone(a as CoreCardId);
        const zoneB = ctx.zones.getCardZone(b as CoreCardId);
        if (zoneA && zoneB && zoneA !== zoneB) {
          // Use a sentinel zone for the temp hop so neither side observes both
          // Cards in the same zone mid-swap (some `getCardsInZone`
          // Implementations sort by insertion order). The sentinel is the
          // Origin zones themselves — A moves out first, B moves into A's
          // Original zone, A moves into B's original zone.
          ctx.zones.moveCard({ cardId: b as CoreCardId, targetZoneId: zoneA as CoreZoneId });
          ctx.zones.moveCard({ cardId: a as CoreCardId, targetZoneId: zoneB as CoreZoneId });
          // Clear combat roles — rule 323.2's per-Cleanup re-derivation will
          // Reassign them based on whether the new battlefield is contested.
          ctx.cards.updateCardMeta?.(
            a as CoreCardId,
            { combatRole: undefined } as unknown as Record<string, unknown>,
          );
          ctx.cards.updateCardMeta?.(
            b as CoreCardId,
            { combatRole: undefined } as unknown as Record<string, unknown>,
          );
        }
      }
      break;
    }

    case "modify-might": {
      const targets = getTargetIds(effect, ctx);
      const rawAmount = resolveAmount(effect.amount ?? 0, ctx);
      // Rule 472.3.b (snapshotting): "If an effect gives a unit '-4 [M] to a
      // Min of 1 this turn' choosing a unit with 2 [M], then the effect will
      // Generate -1 [M] this turn." The limitation is snapshotted at the time
      // The effect begins applying — per-target, based on that target's
      // Current effective Might. After the snapshot, the limit is fixed for
      // The duration of the effect, independent of later buffs or debuffs.
      const minimumBound =
        typeof (effect as unknown as { minimum?: number }).minimum === "number"
          ? ((effect as unknown as { minimum: number }).minimum)
          : undefined;
      // Rule 461.7.b: a "this combat" Might modifier is tracked separately so
      // It can be cleared when the combat ends (not at the Ending phase).
      const isCombatDuration = effect.duration === "combat";
      for (const targetId of targets) {
        const mightBefore = getEffectiveMight(targetId, ctx);
        const meta = ctx.cards.getCardMeta?.(targetId as CoreCardId) as
          | Partial<RiftboundCardMeta>
          | undefined;
        // Rule 472.3.b snapshot — only relevant for *decreases* (rule 472.3.d.2
        // Says decreases get a snapshotted limit). For positive amounts the
        // Minimum is irrelevant.
        let amount = rawAmount;
        if (
          minimumBound !== undefined &&
          rawAmount < 0 &&
          mightBefore + rawAmount < minimumBound
        ) {
          // Clamp so post-application effective Might equals the snapshotted min.
          amount = minimumBound - mightBefore;
          if (amount > 0) {
            // Already at/below the floor — no decrease can apply.
            amount = 0;
          }
        }
        if (isCombatDuration) {
          const currentCombatMod = meta?.combatMightModifier ?? 0;
          ctx.cards.updateCardMeta?.(
            targetId as CoreCardId,
            {
              combatMightModifier: currentCombatMod + amount,
            } as unknown as Record<string, unknown>,
          );
        } else {
          const currentMod = meta?.mightModifier ?? 0;
          ctx.cards.updateCardMeta?.(
            targetId as CoreCardId,
            {
              mightModifier: currentMod + amount,
            } as unknown as Record<string, unknown>,
          );
        }
        checkBecomesMighty(targetId, mightBefore, ctx);
      }
      break;
    }

    case "heal": {
      const healAmount = resolveAmount(effect.amount ?? 1, ctx);
      const targets = getTargetIds(effect, ctx);
      const healTargets = targets.length === 0 ? [ctx.sourceCardId] : targets;
      for (const targetId of healTargets) {
        ctx.counters.removeCounter(targetId as CoreCardId, "damage", healAmount);
        // Healing can cross the Mighty threshold (less damage = higher effective Might)
        // But we track Might via base stats, not damage. Damage only matters for death checks.
      }
      break;
    }

    case "grant-keyword": {
      const kw = effect.keyword;
      if (!kw) {
        break;
      }
      const targets = getTargetIds(effect, ctx);
      const kwTargets = targets.length === 0 ? [ctx.sourceCardId] : targets;
      const duration = (effect.duration ?? "turn") as "turn" | "permanent" | "combat";
      for (const targetId of kwTargets) {
        const meta = ctx.cards.getCardMeta?.(targetId as CoreCardId) as
          | Partial<RiftboundCardMeta>
          | undefined;
        const existing = meta?.grantedKeywords ?? [];
        const entry: GrantedKeyword = { duration, keyword: kw, value: effect.value };
        ctx.cards.updateCardMeta?.(
          targetId as CoreCardId,
          {
            grantedKeywords: [...existing, entry],
          } as unknown as Record<string, unknown>,
        );
      }
      break;
    }

    case "grant-keywords": {
      const kws = effect.keywords;
      if (!kws || kws.length === 0) {
        break;
      }
      const targets = getTargetIds(effect, ctx);
      const kwTargets = targets.length === 0 ? [ctx.sourceCardId] : targets;
      const duration = (effect.duration ?? "turn") as "turn" | "permanent" | "combat";
      for (const targetId of kwTargets) {
        const meta = ctx.cards.getCardMeta?.(targetId as CoreCardId) as
          | Partial<RiftboundCardMeta>
          | undefined;
        const existing = meta?.grantedKeywords ?? [];
        const entries: GrantedKeyword[] = kws.map((k) => ({ duration, keyword: k }));
        ctx.cards.updateCardMeta?.(
          targetId as CoreCardId,
          {
            grantedKeywords: [...existing, ...entries],
          } as unknown as Record<string, unknown>,
        );
      }
      break;
    }

    case "add-resource": {
      const pool = ctx.draft.runePools[ctx.playerId];
      if (pool) {
        if (effect.energy) {
          pool.energy += effect.energy;
        }
        if (effect.power) {
          for (const domain of effect.power) {
            const key = domain as keyof typeof pool.power;
            pool.power[key] = (pool.power[key] ?? 0) + 1;
          }
        }
      }
      break;
    }

    case "banish": {
      const targets = getTargetIds(effect, ctx);
      // If the source card is flagged to track exiled cards (The Zero Drive),
      // Record each banished card's instance ID in the source's
      // `exiledByThis` meta. The state-based cleanup will return those cards
      // When the source later leaves the board.
      const banishRegistry = getGlobalCardRegistry();
      const banishSourceDef = banishRegistry.get(ctx.sourceCardId);
      if (banishSourceDef?.tracksExiledCards === true && targets.length > 0) {
        const sourceMeta = ctx.cards.getCardMeta?.(ctx.sourceCardId as CoreCardId) as
          | Partial<RiftboundCardMeta>
          | undefined;
        const existing = sourceMeta?.exiledByThis ?? [];
        ctx.cards.updateCardMeta?.(
          ctx.sourceCardId as CoreCardId,
          {
            exiledByThis: [...existing, ...(targets as string[])],
          } as unknown as Record<string, unknown>,
        );
      }
      for (const targetId of targets) {
        ctx.zones.moveCard({
          cardId: targetId as CoreCardId,
          targetZoneId: "banishment" as CoreZoneId,
        });
      }
      break;
    }

    case "counter": {
      // Counter a spell — mark the next item on the chain as countered
      // So its effect is skipped during resolution (rule 543)
      const chain = ctx.draft.interaction?.chain;
      if (chain && chain.items.length > 0) {
        // The item below the counter on the stack is the target
        // (counter was on top, already popped; the new top is the target)
        const { items } = chain;
        if (items.length > 0) {
          const targetItem = items[items.length - 1];
          if (targetItem && !targetItem.countered) {
            // Mutate in-place (we're inside an Immer draft)
            (targetItem as { countered: boolean }).countered = true;
          }
        }
      }
      break;
    }

    case "create-token": {
      if (!ctx.createCardInZone) {
        break;
      }
      const tokenDef = effect.token;
      if (!tokenDef) {
        break;
      }
      const count = resolveAmount(effect.amount ?? 1, ctx);
      let targetZone: string;
      if (effect.location === "here" && ctx.sourceZone) {
        targetZone = ctx.sourceZone;
      } else if (effect.location && effect.location !== "here") {
        targetZone = effect.location as string;
      } else {
        targetZone = "base";
      }

      const registry = getGlobalCardRegistry();
      for (let i = 0; i < count; i++) {
        const tokenId = `token-${tokenDef.name.toLowerCase().replace(/\s+/g, "-")}-${Date.now()}-${i}`;
        ctx.createCardInZone(tokenId, targetZone, ctx.playerId);
        registry.register(tokenId, {
          cardType: tokenDef.type === "gear" ? "gear" : "unit",
          id: tokenId,
          isToken: true,
          keywords: tokenDef.keywords,
          might: tokenDef.might,
          name: tokenDef.name,
        });
      }
      break;
    }

    case "attach": {
      const equipTargets = getTargetIds(
        { ...effect, target: effect.equipment } as ExecutableEffect,
        ctx,
      );
      const unitTargets = getTargetIds({ ...effect, target: effect.to } as ExecutableEffect, ctx);
      if (equipTargets[0] && unitTargets[0]) {
        ctx.counters.setFlag(equipTargets[0] as CoreCardId, "attachedTo", true);
      }
      break;
    }

    case "detach": {
      const detachTargets = getTargetIds(
        { ...effect, target: effect.equipment } as ExecutableEffect,
        ctx,
      );
      if (detachTargets[0]) {
        ctx.counters.setFlag(detachTargets[0] as CoreCardId, "attachedTo", false);
      }
      break;
    }

    case "sequence": {
      if (effect.effects) {
        // Rule 472.3.d.2 — "When evaluating a sequence of effects that modify
        // A unit's Might, all increases are applied before any decreases, and
        // Each decrease's `minimum` snapshot reads the post-increase value."
        // The static-aura pass already handles this; the one-shot path must
        // Too. We collect contiguous `modify-might` effects from the sequence
        // Into stable subgroups and reorder *within each subgroup* so all
        // Positive (or zero) `amount` effects run before any negative ones.
        // Non-modify-might effects act as fences (we never reorder across
        // Them) so an effect like "kill target then -3 might" stays
        // Sequential. Stable reordering preserves rule 471.1 input order
        // Among same-sign effects.
        const ordered: ExecutableEffect[] = [];
        let modifyMightBuffer: ExecutableEffect[] = [];
        const flush = () => {
          if (modifyMightBuffer.length <= 1) {
            ordered.push(...modifyMightBuffer);
          } else {
            // Stable partition: positives (amount >= 0) first, then negatives.
            const positives = modifyMightBuffer.filter(
              (e) => resolveAmount((e.amount as number | Record<string, unknown>) ?? 0, ctx) >= 0,
            );
            const negatives = modifyMightBuffer.filter(
              (e) => resolveAmount((e.amount as number | Record<string, unknown>) ?? 0, ctx) < 0,
            );
            ordered.push(...positives, ...negatives);
          }
          modifyMightBuffer = [];
        };
        for (const subEffect of effect.effects) {
          if (subEffect.type === "modify-might") {
            modifyMightBuffer.push(subEffect);
          } else {
            flush();
            ordered.push(subEffect);
          }
        }
        flush();
        for (const subEffect of ordered) {
          executeEffect(subEffect, ctx);
        }
      }
      break;
    }

    // ================================================================
    // Control-Flow Effects
    // ================================================================

    case "conditional": {
      // If condition is met, execute "then"; otherwise execute "else".
      // `then`/`else` are first-class fields on ExecutableEffect (see
      // Interface above), so no `as unknown as ...` cast is needed.
      const { condition } = effect as unknown as { condition?: Record<string, unknown> };
      const thenEffect = effect.then;
      const elseEffect = effect.else;

      let conditionMet = true; // Default to true if no condition specified
      if (condition) {
        conditionMet = evaluateEffectCondition(condition, ctx);
      }

      if (conditionMet && thenEffect) {
        executeEffect(thenEffect, ctx);
      } else if (!conditionMet && elseEffect) {
        executeEffect(elseEffect, ctx);
      }
      break;
    }

    case "optional": {
      // "You may..." — execute the inner effect (auto-apply for now)
      const innerEffect = (effect as unknown as { effect?: ExecutableEffect }).effect;
      if (innerEffect) {
        executeEffect(innerEffect, ctx);
      }
      break;
    }

    case "choice": {
      // Player chooses one option — pick the first option for now (needs UI input)
      const { options } = effect as unknown as { options?: { effect: ExecutableEffect }[] };
      if (options && options.length > 0 && options[0]?.effect) {
        executeEffect(options[0].effect, ctx);
      }
      break;
    }

    case "for-each": {
      // Repeat effect for each matching target
      const forEachTarget = (effect as unknown as { target?: TargetDescriptor }).target;
      const forEachEffect = (effect as unknown as { effect?: ExecutableEffect }).effect;
      if (forEachTarget && forEachEffect) {
        const targets = resolveTarget(forEachTarget, {
          cards: ctx.cards,
          draft: ctx.draft,
          playerId: ctx.playerId,
          sourceCardId: ctx.sourceCardId,
          sourceZone: ctx.sourceZone,
          zones: ctx.zones,
        });
        for (const targetId of targets) {
          // Execute the effect with target overridden to this specific card
          executeEffect(
            { ...forEachEffect, target: { type: "self" } },
            {
              ...ctx,
              sourceCardId: targetId,
            },
          );
        }
      }
      break;
    }

    case "do-times": {
      const times = (effect as unknown as { times?: number }).times ?? 1;
      const repeatedEffect = (effect as unknown as { effect?: ExecutableEffect }).effect;
      if (repeatedEffect) {
        for (let i = 0; i < times; i++) {
          executeEffect(repeatedEffect, ctx);
        }
      }
      break;
    }

    // ================================================================
    // Remaining Mechanical Effects
    // ================================================================

    case "fight": {
      // Rule 417.6.b.3 (Challenge example) — "They deal damage equal to their
      // Mights to each other." The Might used MUST be the unit's current
      // EFFECTIVE Might (`computeEffectiveMight`: base + mightModifier +
      // CombatMightModifier + staticMightBonus + buffed + equipped-mightBonus,
      // Floored at 0), not the printed `def.might`. Previously this branch
      // Read `registry.getMight()` which returned only the base — so a
      // Bellows-Breath'd / static-buffed / "+2 until end of turn"'d unit in a
      // Fight dealt printed damage instead of its real Might.
      const attackerTarget = (effect as unknown as { attacker?: TargetDescriptor }).attacker;
      const defenderTarget = (effect as unknown as { defender?: TargetDescriptor }).defender;
      if (attackerTarget && defenderTarget) {
        const attackers = resolveTarget(attackerTarget, {
          cards: ctx.cards,
          draft: ctx.draft,
          playerId: ctx.playerId,
          sourceCardId: ctx.sourceCardId,
          sourceZone: ctx.sourceZone,
          zones: ctx.zones,
        });
        const defenders = resolveTarget(defenderTarget, {
          cards: ctx.cards,
          draft: ctx.draft,
          playerId: ctx.playerId,
          sourceCardId: ctx.sourceCardId,
          sourceZone: ctx.sourceZone,
          zones: ctx.zones,
        });
        if (attackers[0] && defenders[0]) {
          // ComputeEffectiveMight's `getCardMeta` parameter only needs the
          // Might-affecting fields (buffed/mightModifier/combatMightModifier/
          // StaticMightBonus/equippedWith); the engine's full meta is a
          // Superset of that shape, so the adapter just forwards.
          const getMeta = ctx.cards.getCardMeta
            ? (id: string): Partial<RiftboundCardMeta> | undefined =>
                ctx.cards.getCardMeta?.(id as CoreCardId) as
                  | Partial<RiftboundCardMeta>
                  | undefined
            : undefined;
          const aMight = computeEffectiveMight(
            attackers[0],
            getMeta as Parameters<typeof computeEffectiveMight>[1],
          );
          const dMight = computeEffectiveMight(
            defenders[0],
            getMeta as Parameters<typeof computeEffectiveMight>[1],
          );
          if (aMight > 0) {
            ctx.counters.addCounter(defenders[0] as CoreCardId, "damage", aMight);
          }
          if (dMight > 0) {
            ctx.counters.addCounter(attackers[0] as CoreCardId, "damage", dMight);
          }
        }
      }
      break;
    }

    case "play": {
      // Rule 555 — "Playing" a card means moving it from its source zone to
      // The board AND firing on-play triggers. Effect-driven plays
      // (Heedless Resurrection, Immortal Phoenix, Glasc Mixologist's
      // Deathknell, Legion play-from-trash via effect) all flow through here.
      // The `playUnit` MOVE separately fires triggers via its own pipeline;
      // When we get here it's because an EFFECT is doing the play, so we
      // Must fire the triggers ourselves (rule 372 — a play that originates
      // From an effect still emits play-self/play-card per rule 555).
      //
      // The card's controller for the play becomes the player resolving the
      // Effect (rule 555.1.b: "The player playing the card chooses where it
      // Is placed"), which means a play-from-trash that comes from an
      // OPPONENT's effect targeting MY trash would set ME as the controller
      // Anyway — for the cards we currently model, the effect's controller
      // Is always the unit's owner, so this is correct by construction.
      const playFrom = (effect as unknown as { from?: string }).from ?? "hand";
      const targets = getTargetIds(effect, ctx);
      for (const targetId of targets) {
        // Move card to base (default play location)
        ctx.zones.moveCard({
          cardId: targetId as CoreCardId,
          targetZoneId: "base" as CoreZoneId,
        });
        // Ensure the resolving player is the controller — important for
        // Play-from-opponent's-trash or take-control-then-play interactions.
        ctx.cards.setCardController?.(targetId as CoreCardId, ctx.playerId);
        // Fire on-play triggers (rule 555.5).
        if (ctx.fireTriggers) {
          const playedDef = getGlobalCardRegistry().get(targetId);
          const playedCardType = (playedDef?.cardType as string | undefined) ?? "unit";
          ctx.fireTriggers({
            cardId: targetId,
            playerId: ctx.playerId,
            type: "play-self",
          });
          ctx.fireTriggers({
            cardId: targetId,
            cardType: playedCardType,
            playerId: ctx.playerId,
            type: "play-card",
          });
          // Per rule 555: a play-from-trash counts toward the player's
          // "cards played this turn" tally (Legion / rule 724). The
          // Increment is the per-move pipeline's job; we conservatively
          // Bump it here too so trash-replay supports Legion. The pipeline
          // Only fires for top-level play MOVES, not effect-driven plays,
          // So the bump here is necessary, not double-counted.
        }
        // Rule 724 — playing a card increments cardsPlayedThisTurn.
        if (ctx.draft.cardsPlayedThisTurn) {
          const current = ctx.draft.cardsPlayedThisTurn[ctx.playerId] ?? 0;
          ctx.draft.cardsPlayedThisTurn[ctx.playerId] = current + 1;
        }
      }
      break;
    }

    case "look": {
      // Two paths:
      //   1. Informational-only "look" (no `then` directive). For example,
      //      Twisted Fate's "reveal the top rune of your rune deck, then
      //      Recycle it" sequence uses look + recycle as separate steps;
      //      The look step itself is just a peek.
      //   2. Interactive "look, then pick" (`then.draw === "chosen"` or
      //      `then.recycle === "rest"`). This is the Stacked Deck pattern:
      //      "Look at the top 3 cards of your Main Deck. Put 1 into your
      //      Hand and recycle the rest." We write a `look-and-pick`
      //      PendingChoice; `resolvePendingChoice` then routes the picked
      //      Card to its destination and recycles the rest.
      //
      // The look effect's shape (from LookEffect in @tcg/riftbound-types):
      //   { type: "look", amount: number, from: "deck" | "rune-deck" | "opponent-hand",
      //     Then?: { draw?: number | "chosen", recycle?: number | "rest" } }
      const lookEffect = effect as unknown as {
        amount?: number;
        from?: "deck" | "rune-deck" | "opponent-hand";
        then?: {
          draw?: number | "chosen";
          recycle?: number | "rest";
          play?: boolean;
          reveal?: boolean;
        };
      };
      const rawLookCount = lookEffect.amount ?? 1;
      const lookCount =
        typeof rawLookCount === "number"
          ? rawLookCount
          : resolveAmount(rawLookCount as Record<string, unknown>, ctx);
      const fromKind = lookEffect.from ?? "deck";

      // Map the "from" kind to a concrete zone + owner. Opponent-hand is
      // Not currently part of the pick flow — it routes through the
      // `reveal-hand` effect — so we skip the pendingChoice write there.
      let zoneId: CoreZoneId | undefined;
      const owner: string = ctx.playerId;
      if (fromKind === "deck") {
        zoneId = "mainDeck" as CoreZoneId;
      } else if (fromKind === "rune-deck") {
        zoneId = "runeDeck" as CoreZoneId;
      }
      // For opponent-hand or unknown kinds → informational only.
      if (!zoneId) {
        break;
      }

      const deckCards = ctx.zones.getCardsInZone(zoneId, owner as CorePlayerId);
      const topN = deckCards.slice(0, Math.max(0, lookCount));
      if (topN.length === 0) {
        // Nothing to look at — informational no-op.
        break;
      }

      // If there is no `then` directive, this is a pure peek. Headless
      // Play needs no state change; an interactive UI would show the
      // Cards to the player and then resume.
      const thenDir = lookEffect.then;
      if (!thenDir) {
        break;
      }

      // Decide whether this is an interactive pick. The Stacked Deck
      // Pattern is `then: { recycle: "rest" }` with the IMPLIED destination
      // For the pick being the hand (the rules text reads "Put 1 into your
      // Hand and recycle the rest"). `then: { draw: "chosen" }` is the
      // Explicit form. Both mean "pick 1, the rest go somewhere".
      const isPickFromRest = thenDir.recycle === "rest";
      const isChosenDraw = thenDir.draw === "chosen";
      if (!isPickFromRest && !isChosenDraw) {
        // Other `then` shapes (specific counts, play=true, etc.) are out
        // Of scope for this handler — fall through to no-op so we don't
        // Silently mishandle them.
        break;
      }

      // Resolve onPicked / onUnpicked from the spec. `then.recycle: "rest"`
      // Implies pick → hand (Stacked Deck); explicit `then.draw: "chosen"`
      // Also implies pick → hand. We default unpicked → recycle.
      const onPicked: "to-hand" | "to-trash" | "to-play" | "banish" | "recycle" = "to-hand";
      const onUnpicked: "recycle" | "to-top" | "trash" =
        thenDir.recycle === "rest"
          ? "recycle"
          : (thenDir.recycle != null
            ? "recycle"
            : "recycle");

      // Active player is always the picker; for "from deck"/"rune-deck"
      // The deck is the active player's own deck.
      ctx.draft.pendingChoice = {
        onPicked,
        onUnpicked,
        prompter: ctx.playerId,
        revealed: [...topN] as unknown as string[],
        revealer: owner,
        type: "look-and-pick",
      };
      break;
    }

    case "reveal": {
      // Reveal cards — informational only for now
      break;
    }

    case "reveal-hand": {
      // Opponent-reveals-hand + active-player-picks flow.
      // Sets a `pendingChoice` on the game state. All other moves become
      // Illegal until `resolvePendingChoice` is invoked (see chain-moves.ts).
      //
      // Effect shape:
      //   {
      //     Type: "reveal-hand",
      //     Target: { type: "player", controller: "enemy" }, // whose hand to reveal
      //     Filter?: { excludeCardTypes?: string[] },        // non-unit, etc.
      //     OnPicked?: "recycle" | "banish" | "discard",     // default: recycle
      //   }
      const revealerOverride = (effect as unknown as { revealer?: string }).revealer;
      const revealer =
        revealerOverride ??
        Object.keys(ctx.draft.players).find((p) => p !== ctx.playerId) ??
        ctx.playerId;
      const revealed = ctx.zones
        .getCardsInZone("hand" as CoreZoneId, revealer as CorePlayerId)
        .map((id) => id as string);

      const { filter } = effect as unknown as { filter?: { excludeCardTypes?: string[] } };
      const onPicked = ((effect as unknown as { onPicked?: "recycle" | "banish" | "discard" })
        .onPicked ?? "recycle") as "recycle" | "banish" | "discard";

      // If the revealer has no cards in hand, there's nothing to pick — skip.
      if (revealed.length === 0) {
        break;
      }

      ctx.draft.pendingChoice = {
        filter,
        onPicked,
        prompter: ctx.playerId,
        revealed,
        revealer,
        type: "reveal-and-pick",
      };
      break;
    }

    case "prevent-damage": {
      // Rule 437 — Prevent: record a Prevent Value on the target unit(s).
      // "all" is an infinite Prevent Value (rule 437.1.b.1.b); a numeric X is
      // The "Prevent the next X damage" amount (defaults to 1 when omitted).
      // Multiple Prevent actions on the same unit are summed (rule 437 — the
      // Value tracked on the unit accumulates; numeric + "all" → "all").
      const targets = getTargetIds(effect, ctx);
      const preventTargets = targets.length === 0 ? [ctx.sourceCardId] : targets;
      const rawAmount = effect.amount as number | "all" | Record<string, unknown> | undefined;
      const newValue: number | "all" =
        rawAmount === "all"
          ? "all"
          : rawAmount === undefined
            ? 1
            : typeof rawAmount === "number"
              ? rawAmount
              : resolveAmount(rawAmount as Record<string, unknown>, ctx);
      for (const targetId of preventTargets) {
        const meta = ctx.cards.getCardMeta?.(targetId as CoreCardId) as
          | Partial<RiftboundCardMeta>
          | undefined;
        const combined = combinePreventValues(meta?.preventDamage, newValue);
        ctx.cards.updateCardMeta?.(
          targetId as CoreCardId,
          { preventDamage: combined } as unknown as Record<string, unknown>,
        );
      }
      break;
    }

    case "take-control": {
      // Rule 187 / 323.6 — change the controller of a card. The card retains
      // Its OWNER (rule 174) but its `controller` field is set to the
      // Resolving player. For `duration:"turn"` or `duration:"until-leaves"`,
      // Record a pending reversion in
      // `state.pendingControlReverts` so end-of-turn cleanup (or the card's
      // Departure) restores the previous controller (Hostile Takeover:
      // "Lose control of that unit and recall it at end of turn.").
      const targets = getTargetIds(effect, ctx);
      const newController = ctx.playerId;
      const {duration} = (effect as unknown as { duration?: string });
      for (const targetId of targets) {
        const prevController =
          ctx.cards.getCardController?.(targetId as CoreCardId) ??
          ctx.cards.getCardOwner(targetId as CoreCardId) ??
          newController;
        // Only mutate if controller actually changes.
        if (prevController !== newController) {
          ctx.cards.setCardController?.(targetId as CoreCardId, newController);
          // For "turn" or "until-leaves" we need a reversion slot.
          if (duration === "turn" || duration === "until-leaves") {
            const draftWithReverts = ctx.draft as RiftboundGameState & {
              pendingControlReverts?: {
                cardId: string;
                originalController: string;
                expires: "end-of-turn" | "until-leaves";
              }[];
            };
            if (!draftWithReverts.pendingControlReverts) {
              draftWithReverts.pendingControlReverts = [];
            }
            draftWithReverts.pendingControlReverts.push({
              cardId: targetId,
              expires: duration === "turn" ? "end-of-turn" : "until-leaves",
              originalController: prevController,
            });
          }
          // Rule 309.x / p1559 — a change of control is a state change that
          // Listeners (and the chain) should see. Emit `controlChanged` for
          // The CARD (the existing battlefield-side helper covers battlefield
          // Controller changes; this covers unit controller changes). The
          // Dispatcher's `EVENT_TYPES_NEEDING_RECALC` already includes
          // `controlChanged`, so statics + SBA re-evaluate, and any
          // "When control of a unit changes" listener fires. The reaction
          // Window for opponent to respond comes from the parent chain
          // Mechanism (this effect resolved inside a chain item; the chain
          // Continues with the next item or yields priority back per rule
          // 543.4).
          if (ctx.fireTriggers) {
            ctx.fireTriggers({
              cardId: targetId,
              cause: "take-control",
              controller: newController,
              previousController: prevController,
              type: "cardControlChanged",
            } as unknown as Parameters<NonNullable<typeof ctx.fireTriggers>>[0]);
          }
        }
      }
      break;
    }

    case "enter-ready": {
      const targets = getTargetIds(effect, ctx);
      const enterTargets = targets.length === 0 ? [ctx.sourceCardId] : targets;
      for (const targetId of enterTargets) {
        ctx.counters.setFlag(targetId as CoreCardId, "exhausted", false);
      }
      break;
    }

    case "cost-reduction": {
      // The parser emits `amount`, `by`, or `reduction` depending on the
      // Phrasing ("cost N less" → reduction; "reduced by N" → by; bespoke
      // Triggers use `amount`). Read them all so cost-reduction triggers
      // Emitted from any phrasing land. Also: rule 466.x — when the
      // Ability specifies `minimum`, clamp the resulting effective cost
      // So it never falls below the floor. Implementation: cost is
      // `baseCost + costModifier` at deduction time, so a clamp on
      // `costModifier` to `minimum - baseCost` (a NEGATIVE bound — costMod
      // Must be >= minimum-baseCost) achieves the rule's intent.
      const rawAmount =
        (effect as { amount?: number | Record<string, unknown> }).amount ??
        (effect as { by?: number }).by ??
        (effect as { reduction?: number }).reduction ??
        0;
      const amount =
        typeof rawAmount === "number" ? rawAmount : resolveAmount(rawAmount, ctx);
      const {minimum} = (effect as { minimum?: number });
      const targets = getTargetIds(effect, ctx);
      const costTargets = targets.length === 0 ? [ctx.sourceCardId] : targets;
      const registryForCost = getGlobalCardRegistry();
      for (const targetId of costTargets) {
        const meta = ctx.cards.getCardMeta?.(targetId as CoreCardId) as
          | Partial<RiftboundCardMeta>
          | undefined;
        const current = meta?.costModifier ?? 0;
        let nextMod = current - amount;
        if (typeof minimum === "number") {
          // Rule: effective energy cost cannot go below `minimum`.
          // Effective = baseEnergy + costModifier  (clamped at deduction
          // Time to >= 0). So costModifier >= minimum - baseEnergy.
          const baseEnergy = registryForCost.getCostToDeduct(targetId).energy;
          const floorMod = minimum - baseEnergy;
          if (nextMod < floorMod) {
            nextMod = floorMod;
          }
        }
        ctx.cards.updateCardMeta?.(
          targetId as CoreCardId,
          { costModifier: nextMod } as unknown as Record<string, unknown>,
        );
      }
      break;
    }

    case "cost-increase": {
      const amount = resolveAmount(effect.amount ?? 0, ctx);
      const targets = getTargetIds(effect, ctx);
      const costTargets = targets.length === 0 ? [ctx.sourceCardId] : targets;
      for (const targetId of costTargets) {
        const meta = ctx.cards.getCardMeta?.(targetId as CoreCardId) as
          | Partial<RiftboundCardMeta>
          | undefined;
        const current = meta?.costModifier ?? 0;
        ctx.cards.updateCardMeta?.(
          targetId as CoreCardId,
          { costModifier: current + amount } as unknown as Record<string, unknown>,
        );
      }
      break;
    }

    case "additional-cost": {
      if (ctx.draft.additionalCostsPaid) {
        ctx.draft.additionalCostsPaid[ctx.sourceCardId] = true;
      }
      break;
    }

    case "gain-xp": {
      const xpAmount = resolveAmount(effect.amount ?? 1, ctx);
      const player = ctx.draft.players[ctx.playerId];
      if (player) {
        player.xp += xpAmount;
      }
      // Track XP gained this turn
      if (ctx.draft.xpGainedThisTurn) {
        ctx.draft.xpGainedThisTurn[ctx.playerId] =
          (ctx.draft.xpGainedThisTurn[ctx.playerId] ?? 0) + xpAmount;
      }
      // Fire trigger — the card-facing `gain-xp` trigger event AND the
      // First-class engine-bus `xpGained` event (so the event log / future
      // Listeners see XP gains too). Both flow through the dispatcher.
      if (ctx.fireTriggers) {
        ctx.fireTriggers({ amount: xpAmount, playerId: ctx.playerId, type: "gain-xp" });
        ctx.fireTriggers({ amount: xpAmount, playerId: ctx.playerId, type: "xpGained" });
      }
      break;
    }

    case "spend-xp": {
      const xpAmount = resolveAmount(effect.amount ?? 1, ctx);
      const player = ctx.draft.players[ctx.playerId];
      if (player && player.xp >= xpAmount) {
        player.xp -= xpAmount;
      }
      break;
    }

    case "recycle": {
      // Rule 416 — "Recycling cards is the action in which a player takes
      // One or more cards from a specific zone and then puts it on the
      // Bottom of the corresponding deck." Main Deck cards → mainDeck;
      // Runes → runeDeck (rule 416.1.a-b). The parser emits
      // `{ type: "recycle", target }` for card text like "Recycle me." /
      // "Recycle a unit." — the engine previously had no case for it, so
      // Those effects silently no-op'd. This handles the unit/gear/spell
      // Case (mainDeck destination); rune-typed cards route to runeDeck.
      //
      // Rule 416.5 — "If 2 or more cards are Recycled to the Main Deck
      // Simultaneously, they are placed on the bottom of that deck in a
      // Random order." We move them then shuffle the deck if the host
      // Supplies `shuffleZone` (same fallback pattern as Burn Out).
      const targets = getTargetIds(effect, ctx);
      const recycleTargets = targets.length === 0 ? [ctx.sourceCardId] : targets;
      const registry = getGlobalCardRegistry();
      const ownersInvolved = new Set<string>();
      for (const targetId of recycleTargets) {
        const def = registry.get(targetId as string);
        const dest = def?.cardType === "rune" ? "runeDeck" : "mainDeck";
        ctx.zones.moveCard({
          cardId: targetId as CoreCardId,
          position: "bottom",
          targetZoneId: dest as CoreZoneId,
        });
        const owner = ctx.cards.getCardOwner(targetId as CoreCardId);
        if (owner) {
          ownersInvolved.add(owner);
        }
      }
      // Rule 416.5: simultaneous recycle → randomized order. Single-card
      // Recycles preserve printed bottom-of-deck ordering (no shuffle).
      if (recycleTargets.length >= 2) {
        for (const ownerId of ownersInvolved) {
          ctx.zones.shuffleZone?.("mainDeck" as CoreZoneId, ownerId as CorePlayerId);
          ctx.zones.shuffleZone?.("runeDeck" as CoreZoneId, ownerId as CorePlayerId);
        }
      }
      break;
    }

    case "predict": {
      // Rule: Look at the top N cards of your Main Deck; you may recycle
      // Any of them (put on bottom of deck). For headless/goldfish play,
      // We auto-recycle every card we peeked at. This is observable
      // Behavior: after Predict N on an ordered deck [A,B,C,D,...],
      // The top N cards land at the bottom. Tests can assert on deck
      // Order after Predict.
      //
      // A full interactive implementation would pause for a player
      // Choice (look → optional recycle → resume) via pendingChoice.
      const rawPredictCount = effect.amount ?? 1;
      const predictCount =
        typeof rawPredictCount === "number" ? rawPredictCount : resolveAmount(rawPredictCount, ctx);
      const deckCards = ctx.zones.getCardsInZone(
        "mainDeck" as CoreZoneId,
        ctx.playerId as CorePlayerId,
      );
      const topN = deckCards.slice(0, Math.max(0, predictCount));
      for (const cardId of topN) {
        ctx.zones.moveCard({
          cardId,
          position: "bottom",
          targetZoneId: "mainDeck" as CoreZoneId,
        });
      }
      break;
    }

    case "extra-turn": {
      // Rule 734 (Additional Turns): the controller of this effect (or, if
      // The effect names a player, that player) is told to take an
      // Additional turn. We enqueue them onto `pendingExtraTurns`; the flow
      // Layer dequeues at the next turn transition. Multiple grants stack in
      // FIFO order.
      const targets = getTargetIds(effect, ctx);
      const owner = targets[0] ?? ctx.playerId;
      const draft = ctx.draft as RiftboundGameState & { pendingExtraTurns?: string[] };
      if (!draft.pendingExtraTurns) {
        draft.pendingExtraTurns = [];
      }
      draft.pendingExtraTurns.push(owner);
      break;
    }

    case "add-restriction": {
      const { restriction } = effect as unknown as { restriction: string };
      if (!restriction) {
        break;
      }
      const targets = getTargetIds(effect, ctx);
      const restrictTargets = targets.length === 0 ? [ctx.sourceCardId] : targets;
      for (const targetId of restrictTargets) {
        const meta = ctx.cards.getCardMeta?.(targetId as CoreCardId) as
          | Partial<RiftboundCardMeta>
          | undefined;
        const existing = meta?.restrictions ?? [];
        if (!existing.includes(restriction)) {
          ctx.cards.updateCardMeta?.(
            targetId as CoreCardId,
            { restrictions: [...existing, restriction] } as unknown as Record<string, unknown>,
          );
        }
      }
      break;
    }

    case "remove-restriction": {
      const { restriction } = effect as unknown as { restriction: string };
      if (!restriction) {
        break;
      }
      const targets = getTargetIds(effect, ctx);
      for (const targetId of targets) {
        const meta = ctx.cards.getCardMeta?.(targetId as CoreCardId) as
          | Partial<RiftboundCardMeta>
          | undefined;
        const existing = meta?.restrictions ?? [];
        ctx.cards.updateCardMeta?.(
          targetId as CoreCardId,
          {
            restrictions: existing.filter((r) => r !== restriction),
          } as unknown as Record<string, unknown>,
        );
      }
      break;
    }

    default: {
      break;
    }
  }
}
