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
import { addToChain, createInteractionState } from "../chain";
import { getGlobalCardRegistry } from "../operations/card-lookup";
import { enqueueExtraTurn } from "../operations/turn-queue";
import { hasPlayerWon } from "../game-definition/win-conditions/victory";
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
  /**
   * Targets bound when the spell/ability was placed on the chain (rule 355.8).
   * When present, {@link getTargetIds} returns these instead of re-resolving,
   * so responses that change board state between play and resolution can't
   * silently retarget the effect.
   */
  readonly boundTargets?: readonly string[];
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
  };
  readonly cards: {
    getCardOwner: (cardId: CoreCardId) => string | undefined;
    getCardController?: (cardId: CoreCardId) => string | undefined;
    setCardController?: (cardId: CoreCardId, controllerId: CorePlayerId) => void;
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
  if (ctx.boundTargets) {
    return [...ctx.boundTargets];
  }
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
  const staticBonus = meta?.staticMightBonus ?? 0;

  let equipBonus = 0;
  for (const equipId of meta?.equippedWith ?? []) {
    equipBonus += registry.getMightBonus(equipId);
  }

  return Math.max(0, baseMight + buffBonus + mightMod + staticBonus + equipBonus);
}

/**
 * Resolve an AmountExpression to a numeric value.
 *
 * Handles dynamic amounts like "equal to this unit's Might",
 * "number of cards in hand", "number of cards in trash", or "count of matching targets".
 */
function resolveAmount(
  amount: number | string | Record<string, unknown> | undefined | null,
  ctx: EffectContext,
): number {
  if (typeof amount === "number") {
    return amount;
  }
  if (amount == null) {
    return 0;
  }
  if (typeof amount === "string") {
    // Card parser emits amount:"all" for heal-all / prevent-all-damage effects.
    return amount === "all" ? Number.MAX_SAFE_INTEGER : 0;
  }

  // Handle AmountExpression objects
  if ("might" in amount) {
    const mightRef = amount.might;
    if (mightRef === "self") {
      return getEffectiveMight(ctx.sourceCardId, ctx);
    }
    // Rule 355.14.a: "damage equal to <a friendly unit>'s Might" — the amount
    // reference is a caster-chosen standard target. Prefer the bound choice
    // (locked at finalization per 355.15); otherwise fall back to the first
    // legal match so the expression never silently collapses to 0.
    if (typeof mightRef === "object" && mightRef !== null) {
      const refId =
        ctx.boundTargets?.[0] ??
        resolveTarget(mightRef as TargetDescriptor, {
          cards: ctx.cards,
          draft: ctx.draft,
          playerId: ctx.playerId,
          sourceCardId: ctx.sourceCardId,
          sourceZone: ctx.sourceZone,
          zones: ctx.zones,
        })[0];
      return refId ? getEffectiveMight(refId, ctx) : 0;
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
  if ("revealTop" in amount) {
    // rule-id: ogn-121-298 (Teemo, Strategist) — reveal the top N of your Main
    // Deck, count cards with the keyword, then recycle every revealed card.
    const n = (amount.revealTop as number) ?? 0;
    const keyword = amount.withKeyword as string;
    const registry = getGlobalCardRegistry();
    const topN = ctx.zones
      .getCardsInZone("mainDeck" as CoreZoneId, ctx.playerId as CorePlayerId)
      .slice(0, n)
      .map((c) => c as string);
    const hits = topN.filter((id) => registry.hasKeyword(id, keyword)).length;
    if ((amount.then ?? "recycle") === "recycle") {
      for (const id of topN) {
        ctx.zones.moveCard({
          cardId: id as CoreCardId,
          position: "bottom",
          targetZoneId: "mainDeck" as CoreZoneId,
        });
      }
    }
    return hits;
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
      const baseCards = ctx.zones.getCardsInZone(
        "base" as CoreZoneId,
        ctx.playerId as CorePlayerId,
      );
      return baseCards.length > 0;
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
    case "count": {
      const target = condition.target as TargetDescriptor | undefined;
      const cmp = condition.comparison as
        | { lte?: number; gte?: number; eq?: number }
        | undefined;
      let n: number;
      if (target && (target as { type?: string }).type === "rune") {
        n = ctx.zones.getCardsInZone("runePool" as CoreZoneId, ctx.playerId as CorePlayerId)
          .length;
      } else {
        n = resolveTarget(target, {
          cards: ctx.cards,
          draft: ctx.draft,
          playerId: ctx.playerId,
          sourceCardId: ctx.sourceCardId,
          sourceZone: ctx.sourceZone,
          zones: ctx.zones,
        }).length;
      }
      if (cmp?.lte !== undefined && n > cmp.lte) return false;
      if (cmp?.gte !== undefined && n < cmp.gte) return false;
      if (cmp?.eq !== undefined && n !== cmp.eq) return false;
      return true;
    }
    case "target-controller": {
      const want = condition.controller as "friendly" | "enemy" | undefined;
      const bound = ctx.boundTargets?.[0];
      if (!bound) return false;
      const owner = ctx.cards.getCardOwner(bound as CoreCardId) ?? "";
      return want === "friendly" ? owner === ctx.playerId : owner !== ctx.playerId;
    }
    case "paid-additional-cost": {
      // rule-id: ven-083-166 / rule 560 — playSpell records whether the
      // caster elected the optional additional cost; absent means unpaid.
      return ctx.draft.additionalCostsPaid?.[ctx.sourceCardId] === true;
    }
    default: {
      return true;
    }
  }
}

/**
 * Rule 143.4 override for tokens (sfd-171-221 Renata Glasc, ogn-011-298 Magma
 * Wurm): scan the creating player's board cards for a static grant-keyword
 * ability that grants the virtual `EntersReady` keyword to a matching unit
 * token. Static-ability recalculation only stamps `grantedKeywords` after the
 * token already exists exhausted, so create-token must consult these grants
 * up-front the same way the play-card path consults `enter-ready`.
 */
function tokenEntersReadyFromStaticGrant(
  ctx: EffectContext,
  tokenType: string,
): boolean {
  if (tokenType === "gear") {
    return false;
  }
  const registry = getGlobalCardRegistry();
  const boardIds: string[] = [
    ...ctx.zones.getCardsInZone("base" as CoreZoneId, ctx.playerId as CorePlayerId),
    ...ctx.zones.getCardsInZone("legendZone" as CoreZoneId, ctx.playerId as CorePlayerId),
    ...ctx.zones.getCardsInZone("championZone" as CoreZoneId, ctx.playerId as CorePlayerId),
  ] as string[];
  for (const bfId of Object.keys(ctx.draft.battlefields)) {
    for (const id of ctx.zones.getCardsInZone(`battlefield-${bfId}` as CoreZoneId)) {
      if (ctx.cards.getCardOwner(id) === ctx.playerId) {
        boardIds.push(id as string);
      }
    }
  }
  for (const sourceId of boardIds) {
    const abilities = registry.getAbilities(sourceId) ?? [];
    for (const ability of abilities) {
      if ((ability as { type?: string })?.type !== "static") {
        continue;
      }
      const eff = (ability as { effect?: Record<string, unknown> }).effect;
      if (eff?.type !== "grant-keyword" || eff.keyword !== "EntersReady") {
        continue;
      }
      if ((ability as { condition?: unknown }).condition !== undefined) {
        continue;
      }
      const target = eff.target as
        | { controller?: string; type?: string; filter?: string }
        | undefined;
      if (target?.controller && target.controller !== "friendly") {
        continue;
      }
      if (target?.type && target.type !== "unit") {
        continue;
      }
      if (target?.filter && target.filter !== "token") {
        continue;
      }
      return true;
    }
  }
  return false;
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
        // Check if deck is empty → Burn Out (rule 518)
        const deckCards = ctx.zones.getCardsInZone(
          "mainDeck" as CoreZoneId,
          ctx.playerId as CorePlayerId,
        );
        if (deckCards.length === 0) {
          // Move trash to deck
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
          // Opponent scores 1 point
          for (const opponentId of Object.keys(ctx.draft.players)) {
            if (opponentId !== ctx.playerId) {
              const opponent = ctx.draft.players[opponentId];
              if (opponent) {
                opponent.victoryPoints += 1;
                if (hasPlayerWon(ctx.draft, opponentId)) {
                  ctx.draft.status = "finished";
                  ctx.draft.winner = opponentId;
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
      // Rule 355.14.a-c / 355.15: split damage. The caster first chooses a
      // friendly reference unit as a standard target (raised via choose-target
      // when >1 candidate), then up to N enemy units as split targets where
      // N = that unit's current Might; each split target takes exactly 1.
      // Zero split targets is legal (355.14.c). All choices lock at finalization.
      if ((effect as { split?: boolean }).split === true) {
        const resolverCtx = {
          cards: ctx.cards,
          draft: ctx.draft,
          playerId: ctx.playerId,
          sourceCardId: ctx.sourceCardId,
          sourceZone: ctx.sourceZone,
          zones: ctx.zones,
        };
        const rawMight = (effect.amount as { might?: unknown } | undefined)?.might;
        let refId: string | undefined = ctx.boundTargets?.[0];
        // Rule 359.3.e.2 / 359.3.e.12 (unl-192-219): the reference unit was
        // chosen at play time; if it left the board, changed controller, or
        // stopped being a unit before resolution it is now an illegal target
        // and its Might referent is null → deal no damage.
        if (refId !== undefined && typeof rawMight === "object" && rawMight !== null) {
          const stillLegal = resolveTarget(
            { ...(rawMight as TargetDescriptor), quantity: "all" },
            resolverCtx,
          ).includes(refId);
          if (!stillLegal) {
            break;
          }
        }
        if (refId === undefined && typeof rawMight === "object" && rawMight !== null) {
          const refOptions = resolveTarget(
            { ...(rawMight as TargetDescriptor), quantity: "all" },
            resolverCtx,
          );
          if (refOptions.length >= 2) {
            ctx.draft.pendingChoice = {
              type: "choose-target",
              playerId: ctx.playerId,
              sourceCardId: ctx.sourceCardId,
              effect,
              options: refOptions,
              remaining: 1,
            } as RiftboundGameState["pendingChoice"];
            break;
          }
          refId = refOptions[0];
        }
        const n = Math.max(
          0,
          refId ? getEffectiveMight(refId, ctx) : resolveAmount(effect.amount ?? 0, ctx),
        );
        const legalPool = effect.target
          ? resolveTarget(
              { ...(effect.target as TargetDescriptor), quantity: "all" },
              resolverCtx,
            )
          : [];
        // Rule 355.14.b/c / 355.15: split targets are caster-chosen at
        // finalization and travel in boundTargets after the reference unit
        // at index 0. Rule 359.3.e.2 drops any that became illegal.
        // Rule 355.14.e/f/g / 359.3.f.2: distribution is a RESOLUTION-time
        // caster choice — extra occurrences of a target id in boundTargets
        // encode surplus damage the caster has already assigned to it.
        let splitTargets: string[];
        const assigned: Record<string, number> = {};
        if (ctx.boundTargets && ctx.boundTargets.length > 1) {
          splitTargets = ctx.boundTargets
            .slice(1)
            .filter((id) => legalPool.includes(id));
          for (const id of splitTargets) {
            assigned[id] = (assigned[id] ?? 0) + 1;
          }
          const uniqueTargets = Object.keys(assigned);
          // Rule 355.14.h / 355.14.h.1 (unl-192-219): if the reference unit's
          // resolution-time Might is now less than the chosen split-target
          // count, the controller drops exactly (count − Might) targets — no
          // more — so every remaining target can receive its mandatory ≥1.
          if (uniqueTargets.length > n && refId !== undefined) {
            ctx.draft.pendingChoice = {
              type: "choose-target",
              playerId: ctx.playerId,
              sourceCardId: ctx.sourceCardId,
              effect,
              options: uniqueTargets,
              remaining: uniqueTargets.length - n,
              boundTargets: [refId, ...uniqueTargets],
            } as RiftboundGameState["pendingChoice"];
            break;
          }
          splitTargets = uniqueTargets;
        } else {
          splitTargets = legalPool.slice(0, n);
          for (const id of splitTargets) {
            assigned[id] = 1;
          }
        }
        const assignedTotal = Object.values(assigned).reduce((a, b) => a + b, 0);
        let surplus = Math.max(0, n - assignedTotal);
        // Rule 355.14.e/f/g (unl-192-219): the caster distributes surplus
        // damage at resolution — one choose-target pick per surplus point,
        // each appended to boundTargets so re-entry sees it as +1 assigned.
        if (surplus > 0 && splitTargets.length > 1 && refId !== undefined) {
          const encoded: string[] = [refId];
          for (const id of splitTargets) {
            for (let i = 0; i < assigned[id]; i++) encoded.push(id);
          }
          ctx.draft.pendingChoice = {
            type: "choose-target",
            playerId: ctx.playerId,
            sourceCardId: ctx.sourceCardId,
            effect,
            options: splitTargets,
            remaining: surplus,
            boundTargets: encoded,
            assign: true,
          } as RiftboundGameState["pendingChoice"];
          break;
        }
        // Rule 355.14.f/g: each chosen target takes its ≥1 mandatory point plus
        // any caster-assigned surplus; a lone target (no choice possible)
        // absorbs the whole surplus so all available damage is distributed.
        for (const targetId of splitTargets) {
          const priorDamage =
            (
              ctx.cards.getCardMeta?.(targetId as CoreCardId) as
                | Partial<RiftboundCardMeta>
                | undefined
            )?.damage ?? 0;
          const dmg = assigned[targetId] + surplus;
          surplus = 0;
          ctx.counters.addCounter(targetId as CoreCardId, "damage", dmg);
          ctx.cards.updateCardMeta?.(
            targetId as CoreCardId,
            { damage: priorDamage + dmg } as unknown as Record<string, unknown>,
          );
        }
        break;
      }
      const rawAmount = effect.amount ?? 1;
      const amount =
        typeof rawAmount === "number"
          ? rawAmount
          : resolveAmount(rawAmount as Record<string, unknown>, ctx);
      const targets = getTargetIds(effect, ctx);
      for (const targetId of targets) {
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
        // Mirror to meta.damage — state-based death checks (rule 520), the
        // end-of-turn clear, and the UI all read meta.damage, not the
        // __counters bag. Without this, spell/ability damage is invisible
        // and never kills a unit. Read the prior value BEFORE addCounter so
        // callers whose counter store aliases meta.damage don't double-apply.
        const priorDamage =
          (
            ctx.cards.getCardMeta?.(targetId as CoreCardId) as
              | Partial<RiftboundCardMeta>
              | undefined
          )?.damage ?? 0;
        ctx.counters.addCounter(targetId as CoreCardId, "damage", amount);
        ctx.cards.updateCardMeta?.(
          targetId as CoreCardId,
          {
            damage: priorDamage + amount,
          } as unknown as Record<string, unknown>,
        );
      }
      break;
    }

    case "kill": {
      const targets = getTargetIds(effect, ctx);
      for (const targetId of targets) {
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
        // rule-id: unl-043-219 — setFlag writes meta.__flags.buffed but every Might
        // reader (getEffectiveMight, static-abilities, cards.ts) checks top-level
        // meta.buffed; mirror it there so the +1 Might buff is actually observed.
        ctx.cards.updateCardMeta?.(
          targetId as CoreCardId,
          { buffed: true } as unknown as Record<string, unknown>,
        );
        checkBecomesMighty(targetId, mightBefore, ctx);
      }
      break;
    }

    case "score": {
      const amount = resolveAmount(effect.amount ?? 1, ctx);
      const player = ctx.draft.players[ctx.playerId];
      if (player) {
        player.victoryPoints += amount;
        if (hasPlayerWon(ctx.draft, ctx.playerId)) {
          ctx.draft.status = "finished";
          ctx.draft.winner = ctx.playerId;
        }
      }
      break;
    }

    case "channel": {
      const count = resolveAmount(effect.amount ?? 1, ctx);
      for (let i = 0; i < count; i++) {
        const runes = ctx.zones.getCardsInZone(
          "runeDeck" as CoreZoneId,
          ctx.playerId as CorePlayerId,
        );
        if (runes[0]) {
          ctx.zones.moveCard({
            cardId: runes[0],
            targetZoneId: "base" as CoreZoneId,
          });
        }
      }
      break;
    }

    case "ready": {
      const targets = getTargetIds(effect, ctx);
      // Only fall back to the source card when the ability has NO target
      // descriptor ("ready me"). A targeted ready that finds no legal targets
      // fizzles — otherwise Bubble Bot's "ready another friendly Mech" readies
      // itself when no other Mech is on the board.
      const hasTargetSpec = "target" in effect && effect.target != null;
      const readied = targets.length === 0 && !hasTargetSpec ? [ctx.sourceCardId] : targets;
      for (const targetId of readied) {
        ctx.counters.setFlag(targetId as CoreCardId, "exhausted", false);
        ctx.fireTriggers?.({
          cardId: targetId,
          playerId: ctx.cards.getCardOwner(targetId as CoreCardId) ?? ctx.playerId,
          type: "ready",
        });
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

    case "move": {
      // rule-id: unl-107-219 (Stare Down) — Rule 355.8 / 355.2: "Choose a
      // friendly unit and a battlefield. Move all enemy units at that
      // battlefield with less Might than the chosen unit to their base." The
      // `reference` unit travels as boundTargets[0] (bound at play time by the
      // playSpell enumerator) and the chosen battlefield card id as
      // boundTargets[1]; whichever is not yet bound is prompted via
      // choose-target at resolution. The moved set is criteria-based, so it
      // is resolved here rather than through getTargetIds/boundTargets.
      const moveRef = (effect as unknown as { reference?: TargetDescriptor }).reference;
      if (moveRef && (effect as unknown as { from?: unknown }).from === "chosen-battlefield") {
        const resolverCtx = {
          cards: ctx.cards,
          draft: ctx.draft,
          playerId: ctx.playerId,
          sourceCardId: ctx.sourceCardId,
          sourceZone: ctx.sourceZone,
          zones: ctx.zones,
        };
        const refPool = resolveTarget({ ...moveRef, quantity: "all" }, resolverCtx);
        let refId: string | undefined = ctx.boundTargets?.[0];
        if (refId === undefined) {
          if (refPool.length >= 2) {
            ctx.draft.pendingChoice = {
              type: "choose-target",
              playerId: ctx.playerId,
              sourceCardId: ctx.sourceCardId,
              effect,
              options: refPool,
              remaining: 1,
            } as RiftboundGameState["pendingChoice"];
            break;
          }
          refId = refPool[0];
          if (refId === undefined) {
            break;
          }
        } else if (!refPool.includes(refId)) {
          // Rule 359.3.e.2: the chosen reference left play / changed control →
          // no Might referent, nothing moves.
          break;
        }
        const bfPool = Object.keys(ctx.draft.battlefields);
        let bfId: string | undefined = ctx.boundTargets?.[1];
        if (bfId === undefined) {
          if (bfPool.length >= 2) {
            ctx.draft.pendingChoice = {
              type: "choose-target",
              playerId: ctx.playerId,
              sourceCardId: ctx.sourceCardId,
              effect,
              options: bfPool,
              remaining: 1,
              boundTargets: [refId],
              assign: true,
            } as RiftboundGameState["pendingChoice"];
            break;
          }
          bfId = bfPool[0];
          if (bfId === undefined) {
            break;
          }
        }
        const bfZone = bfId.startsWith("battlefield-") ? bfId : `battlefield-${bfId}`;
        const refMight = getEffectiveMight(refId, ctx);
        const victims = resolveTarget(
          { ...(effect.target as TargetDescriptor), quantity: "all" },
          resolverCtx,
        ).filter(
          (id) =>
            ctx.zones.getCardZone(id as CoreCardId) === bfZone &&
            getEffectiveMight(id, ctx) < refMight,
        );
        for (const id of victims) {
          ctx.zones.moveCard({ cardId: id as CoreCardId, targetZoneId: "base" as CoreZoneId });
        }
        break;
      }

      const targets = getTargetIds(effect, ctx);
      const moveTargets = targets.length === 0 ? [ctx.sourceCardId] : targets;
      const rawDest = (effect as unknown as { to?: string | { battlefield?: string } }).to;

      // rule-id: ven-034-166 — BattlefieldLocation destination ({ battlefield:
      // "controlled" | "enemy" | "open" | "contested" | "any" }): the controller
      // picks a matching battlefield other than the unit's current location.
      // Zero matches fizzles the move; a single match moves directly.
      if (rawDest && typeof rawDest === "object" && typeof rawDest.battlefield === "string") {
        const which = rawDest.battlefield;
        for (const cardId of moveTargets) {
          const currentZone = ctx.zones.getCardZone(cardId as CoreCardId);
          const options = Object.entries(ctx.draft.battlefields)
            .filter(([, bf]) => {
              switch (which) {
                case "controlled":
                  return bf.controller === ctx.playerId;
                case "enemy":
                  return bf.controller !== null && bf.controller !== ctx.playerId;
                case "open":
                  return bf.controller === null;
                case "contested":
                  return bf.contested === true;
                default:
                  return true;
              }
            })
            .map(([bfId]) => `battlefield-${bfId}`)
            .filter((z) => z !== currentZone);
          if (options.length === 0) {
            continue;
          }
          if (options.length === 1 || ctx.draft.pendingChoice) {
            ctx.zones.moveCard({
              cardId: cardId as CoreCardId,
              targetZoneId: options[0] as CoreZoneId,
            });
            continue;
          }
          ctx.draft.pendingChoice = {
            cardId,
            options,
            playerId: ctx.playerId,
            type: "choose-destination",
          };
        }
        break;
      }
      const dest = rawDest as string | undefined;

      if (dest === "choose") {
        // Rule 355.4 — no stated destination: the controller chooses base or
        // any battlefield other than the unit's current zone. Options must be
        // ZONE ids (base / battlefield-<bfId>) so resolvePendingChoice can pass
        // them straight to zones.moveCard (rule 350.1).
        const cardId = moveTargets[0];
        const currentZone = ctx.zones.getCardZone(cardId as CoreCardId);
        const options = [
          "base",
          ...Object.keys(ctx.draft.battlefields).map((bfId) => `battlefield-${bfId}`),
        ].filter((z) => z !== currentZone);
        if (options.length === 0) {
          break;
        }
        ctx.draft.pendingChoice = {
          cardId,
          options,
          playerId: ctx.playerId,
          type: "choose-destination",
        };
        break;
      }

      let targetZone: string;
      if (dest === "here" && ctx.sourceZone) {
        targetZone = ctx.sourceZone;
      } else if (dest && dest !== "here") {
        targetZone = dest;
      } else {
        targetZone = "base";
      }
      for (const targetId of moveTargets) {
        ctx.zones.moveCard({
          cardId: targetId as CoreCardId,
          targetZoneId: targetZone as CoreZoneId,
        });
      }
      break;
    }

    case "discard": {
      const count = resolveAmount(effect.amount ?? 1, ctx);
      const hand = ctx.zones
        .getCardsInZone("hand" as CoreZoneId, ctx.playerId as CorePlayerId)
        .map((id) => id as string);
      if (hand.length === 0) break;
      // The discarding player chooses which card. Use pendingChoice so play
      // pauses until they pick (goldfish auto-resolves via pickDefaultForChoice).
      // count>1 falls back to auto-discard for now — extend PendingChoice with
      // a `remaining` counter to support multi-pick properly.
      if (count === 1) {
        ctx.draft.pendingChoice = {
          onPicked: "discard",
          prompter: ctx.playerId,
          revealed: hand,
          revealer: ctx.playerId,
          sourceCardId: ctx.sourceCardId,
          then: (effect as { then?: unknown }).then,
          type: "reveal-and-pick",
        };
      } else {
        for (let i = 0; i < Math.min(count, hand.length); i++) {
          ctx.zones.moveCard({ cardId: hand[i] as CoreCardId, targetZoneId: "trash" as CoreZoneId });
          // Rule ogn-006-298: emit the discard event for auto-discarded cards.
          ctx.fireTriggers?.({ cardId: hand[i], playerId: ctx.playerId, type: "discard" });
        }
      }
      break;
    }

    case "recycle": {
      // rule-id: unl-204-219-owner-chooses-top-or-bottom — "Its owner places it
      // on the top or bottom of their Main Deck." Only the owner-choice form is
      // executed here; it prompts the target's OWNER via choose-destination
      // with mainDeck-top / mainDeck-bottom options.
      if ((effect as { position?: string }).position !== "owner-choice") {
        break;
      }
      const [targetId] = getTargetIds(effect, ctx);
      if (!targetId) {
        break;
      }
      const owner = ctx.cards.getCardOwner(targetId as CoreCardId) ?? ctx.playerId;
      ctx.draft.pendingChoice = {
        cardId: targetId,
        options: ["mainDeck-top", "mainDeck-bottom"],
        playerId: owner,
        type: "choose-destination",
      };
      break;
    }

    case "return-to-hand": {
      const targets = getTargetIds(effect, ctx);
      // Only fall back to the source card when the ability has NO target
      // descriptor (i.e. "return me to hand"). A targeted return that finds
      // no legal targets fizzles — otherwise Windsinger's on-play "return an
      // enemy unit" bounces itself when the board is empty.
      const hasTargetSpec = "target" in effect && effect.target != null;
      if (targets.length === 0 && !hasTargetSpec) {
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

    case "modify-might": {
      const targets = getTargetIds(effect, ctx);
      const amount = resolveAmount(effect.amount ?? 0, ctx);
      for (const targetId of targets) {
        const mightBefore = getEffectiveMight(targetId, ctx);
        const meta = ctx.cards.getCardMeta?.(targetId as CoreCardId) as
          | Partial<RiftboundCardMeta>
          | undefined;
        const currentMod = meta?.mightModifier ?? 0;
        ctx.cards.updateCardMeta?.(
          targetId as CoreCardId,
          {
            mightModifier: currentMod + amount,
          } as unknown as Record<string, unknown>,
        );
        checkBecomesMighty(targetId, mightBefore, ctx);
      }
      break;
    }

    case "double-might": {
      // rule-id: ven-142-166 — "double a unit's Might this turn": add the
      // unit's current effective Might to its turn-scoped mightModifier
      // (reset at Ending Step alongside other modify-might buffs).
      const targets = getTargetIds(effect, ctx);
      const dmTargets = targets.length === 0 ? [ctx.sourceCardId] : targets;
      for (const targetId of dmTargets) {
        const mightBefore = getEffectiveMight(targetId, ctx);
        const meta = ctx.cards.getCardMeta?.(targetId as CoreCardId) as
          | Partial<RiftboundCardMeta>
          | undefined;
        ctx.cards.updateCardMeta?.(
          targetId as CoreCardId,
          {
            mightModifier: (meta?.mightModifier ?? 0) + mightBefore,
          } as unknown as Record<string, unknown>,
        );
        checkBecomesMighty(targetId, mightBefore, ctx);
      }
      break;
    }

    case "grant-ability": {
      // rule-id: ven-142-166 — "give it '<cost>: <effect>' this turn": expose
      // `registry.getAbilities(sourceCardId)[abilityIndex]` as an activated
      // ability of the target (host pays, host is `self`) until it expires.
      const ga = effect as unknown as { abilityIndex?: number; duration?: string };
      if (typeof ga.abilityIndex !== "number") {
        break;
      }
      const targets = getTargetIds(effect, ctx);
      const duration = (ga.duration ?? "turn") as "turn" | "permanent";
      for (const targetId of targets) {
        const meta = ctx.cards.getCardMeta?.(targetId as CoreCardId) as
          | Partial<RiftboundCardMeta>
          | undefined;
        const existing = meta?.grantedAbilities ?? [];
        ctx.cards.updateCardMeta?.(
          targetId as CoreCardId,
          {
            grantedAbilities: [
              ...existing,
              { abilityIndex: ga.abilityIndex, duration, sourceCardId: ctx.sourceCardId },
            ],
          } as unknown as Record<string, unknown>,
        );
      }
      break;
    }

    case "swap-might": {
      const swap = effect as unknown as {
        target1?: TargetDescriptor;
        target2?: TargetDescriptor;
      };
      const resolverCtx = {
        cards: ctx.cards,
        draft: ctx.draft,
        playerId: ctx.playerId,
        sourceCardId: ctx.sourceCardId,
        sourceZone: ctx.sourceZone,
        zones: ctx.zones,
      };
      let a = ctx.boundTargets?.[0];
      let b = ctx.boundTargets?.[1];
      if (!a || !b) {
        const first = resolveTarget(swap.target1, resolverCtx);
        a ??= first[0];
        const second = resolveTarget(swap.target2, {
          ...resolverCtx,
          sourceZone: a ? (ctx.zones.getCardZone(a as CoreCardId) as string) : ctx.sourceZone,
        }).filter((id) => id !== a);
        b ??= second[0];
      }
      if (!a || !b) break;
      const aBefore = getEffectiveMight(a, ctx);
      const bBefore = getEffectiveMight(b, ctx);
      const aMeta = ctx.cards.getCardMeta?.(a as CoreCardId) as
        | Partial<RiftboundCardMeta>
        | undefined;
      const bMeta = ctx.cards.getCardMeta?.(b as CoreCardId) as
        | Partial<RiftboundCardMeta>
        | undefined;
      ctx.cards.updateCardMeta?.(
        a as CoreCardId,
        { mightModifier: (aMeta?.mightModifier ?? 0) + (bBefore - aBefore) } as unknown as Record<
          string,
          unknown
        >,
      );
      ctx.cards.updateCardMeta?.(
        b as CoreCardId,
        { mightModifier: (bMeta?.mightModifier ?? 0) + (aBefore - bBefore) } as unknown as Record<
          string,
          unknown
        >,
      );
      checkBecomesMighty(a, aBefore, ctx);
      checkBecomesMighty(b, bBefore, ctx);
      break;
    }

    case "empower":
    case "disempower": {
      const targets = getTargetIds(effect, ctx);
      const empowerTargets = targets.length === 0 ? [ctx.sourceCardId] : targets;
      for (const targetId of empowerTargets) {
        const wasEmpowered =
          (ctx.cards.getCardMeta(targetId as CoreCardId) as { empowered?: boolean } | undefined)
            ?.empowered ?? false;
        ctx.cards.updateCardMeta?.(
          targetId as CoreCardId,
          { empowered: effect.type === "empower" } as unknown as Record<string, unknown>,
        );
        // Rule 827.1.c: "When I become [Empowered]" fires on the false→true edge.
        if (effect.type === "empower" && !wasEmpowered) {
          ctx.fireTriggers?.({
            cardId: targetId,
            owner: ctx.cards.getCardOwner(targetId as CoreCardId) ?? ctx.playerId,
            type: "empower",
          });
        }
      }
      break;
    }

    case "replacement": {
      // Rule 571: an activated ability that resolves to a replacement effect
      // installs it into game state so future events can consult it. The
      // damage-bonus consumer wiring is TODO; this at least records intent.
      const active = ctx.draft.activeReplacements ?? [];
      // rule-id: unl-007-219 — a die-replacement rider ("If it would die this
      // turn, banish it instead") is bound to the specific unit(s) the effect
      // targeted, so state-based checks can match it against the dying card.
      const replEff = effect as unknown as { replaces?: string; target?: unknown };
      const targetCardIds =
        replEff.replaces === "die" && (replEff.target !== undefined || ctx.boundTargets)
          ? getTargetIds(effect, ctx)
          : undefined;
      (ctx.draft as { activeReplacements?: unknown[] }).activeReplacements = [
        ...active,
        {
          ...effect,
          owner: ctx.playerId,
          sourceCardId: ctx.sourceCardId,
          ...(targetCardIds && targetCardIds.length > 0 ? { targetCardIds } : {}),
        },
      ];
      break;
    }

    case "heal": {
      const healAmount = resolveAmount(effect.amount ?? 1, ctx);
      const targets = getTargetIds(effect, ctx);
      const healTargets = targets.length === 0 ? [ctx.sourceCardId] : targets;
      for (const targetId of healTargets) {
        // Read prior value BEFORE removeCounter so callers whose counter
        // store aliases meta.damage don't double-apply.
        const priorDamage =
          (
            ctx.cards.getCardMeta?.(targetId as CoreCardId) as
              | Partial<RiftboundCardMeta>
              | undefined
          )?.damage ?? 0;
        ctx.counters.removeCounter(targetId as CoreCardId, "damage", healAmount);
        ctx.cards.updateCardMeta?.(
          targetId as CoreCardId,
          {
            damage: Math.max(0, priorDamage - healAmount),
          } as unknown as Record<string, unknown>,
        );
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

    case "extra-turn": {
      // Rule 734: an additional turn is inserted directly after the current
      // turn in the repeating turn queue. The flow layer's turn.onEnd hook
      // dequeues it before normal seat-order rotation applies.
      enqueueExtraTurn(ctx.draft, ctx.playerId);
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
      // Rule unl-160-219: chain-moves stamps ability-minted tokens with
      // definitionId `token-def-<slug>`; the snapshot builder resolves that
      // id, so mirror the manual addToken path and register the shared
      // definition once under the same key (instance ids are still
      // registered below for by-instance registry lookups).
      const tokenSlug = tokenDef.name.toLowerCase().replace(/\s+/g, "-");
      const tokenDefinitionId = `token-def-${tokenSlug}`;
      if (!registry.get(tokenDefinitionId)) {
        registry.register(tokenDefinitionId, {
          cardType: tokenDef.type === "gear" ? "gear" : "unit",
          id: tokenDefinitionId,
          keywords: tokenDef.keywords ? [...tokenDef.keywords] : undefined,
          might: tokenDef.might,
          name: tokenDef.name,
        });
      }
      // Rule sfd-171-221: a static EntersReady grant on a friendly board card
      // overrides rule 143.4 for every token this effect creates.
      const tokenEntersReady = tokenEntersReadyFromStaticGrant(ctx, tokenDef.type);
      for (let i = 0; i < count; i++) {
        const tokenId = `token-${tokenSlug}-${Date.now()}-${i}`;
        ctx.createCardInZone(tokenId, targetZone, ctx.playerId);
        // Rule 143.4 / 185.2.d: token units enter play exhausted; gear tokens
        // enter ready unless the effect says otherwise (sfd-004-221).
        if ((tokenDef.type !== "gear" || effect.ready === false) && !tokenEntersReady) {
          ctx.counters.setFlag(tokenId as CoreCardId, "exhausted", true);
        }
        // `effect` (and thus `tokenDef`) reaches here via the chain-state
        // Draft when resolving from passChainPriority, so any nested array
        // Is an immer proxy that will be revoked after this reducer's
        // Produce() returns. Copy arrays before storing them in the
        // Long-lived registry so later hasKeyword() reads don't throw.
        registry.register(tokenId, {
          cardType: tokenDef.type === "gear" ? "gear" : "unit",
          id: tokenId,
          keywords: tokenDef.keywords ? [...tokenDef.keywords] : undefined,
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
      const seq = effect as unknown as {
        effects?: ExecutableEffect[];
        pendingValue?: { source: number };
      };
      if (seq.effects) {
        // Rule 354.2 / 309.1 / 323.6: seed from an enclosing sequence's captured
        // pending value so a nested `pending-value` reference still binds to the
        // banished card — Arcane Shift parses as [banish, [play-it, …]], and the
        // inner sequence has no `target` of its own, so without this seed the
        // play step fell through to a board scan and never added the pending
        // chain item that keeps the turn closed (rule 355.2 location choice).
        let pending: readonly string[] | undefined = (
          ctx as { pendingSequenceValue?: readonly string[] }
        ).pendingSequenceValue;
        for (let i = 0; i < seq.effects.length; i++) {
          const sub = seq.effects[i];
          const subTarget = (sub as { target?: { type?: string } | string }).target;
          let subCtx: EffectContext = ctx;
          // Rule 354.2: a `pending-value` target references the card(s) resolved
          // by this sequence's `pendingValue.source` step — bind them explicitly
          // so target resolution never falls through to a board scan.
          if (
            pending &&
            subTarget &&
            typeof subTarget !== "string" &&
            subTarget.type === "pending-value"
          ) {
            subCtx = { ...ctx, boundTargets: pending };
          }
          if (seq.pendingValue?.source === i) {
            pending = getTargetIds(sub, subCtx);
            subCtx = { ...subCtx, boundTargets: pending };
          }
          executeEffect(
            sub,
            { ...subCtx, pendingSequenceValue: pending } as EffectContext,
          );
        }
      }
      break;
    }

    // ================================================================
    // Control-Flow Effects
    // ================================================================

    case "conditional": {
      // If condition is met, execute "then"; otherwise execute "else"
      const { condition } = effect as unknown as { condition?: Record<string, unknown> };
      const thenEffect = (effect as unknown as { then?: ExecutableEffect }).then;
      const elseEffect = (effect as unknown as { else?: ExecutableEffect }).else;

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
      // Two units deal damage equal to their Might to each other
      const attackerTarget = (effect as unknown as { attacker?: TargetDescriptor }).attacker;
      const defenderTarget = (effect as unknown as { defender?: TargetDescriptor }).defender;
      if (attackerTarget && defenderTarget) {
        // rule-id: ven-083-166 (Rampage) / rule 355.8 — the caster-chosen
        // attacker/defender pair is locked at play time and travels in
        // boundTargets as [attacker, defender]; only fall back to descriptor
        // resolution when nothing was bound.
        let attackerId: string | undefined = ctx.boundTargets?.[0];
        let defenderId: string | undefined = ctx.boundTargets?.[1];
        if (!attackerId || !defenderId) {
          const resolverCtx = {
            cards: ctx.cards,
            draft: ctx.draft,
            playerId: ctx.playerId,
            sourceCardId: ctx.sourceCardId,
            sourceZone: ctx.sourceZone,
            zones: ctx.zones,
          };
          attackerId ??= resolveTarget(attackerTarget, resolverCtx)[0];
          defenderId ??= resolveTarget(defenderTarget, resolverCtx).filter(
            (id) => id !== attackerId,
          )[0];
        }
        if (attackerId && defenderId) {
          // rule-id: ven-083-166 (Rampage) — "If you paid the additional cost,
          // give the friendly unit +2 Might this turn" resolves against the
          // chosen attacker only, BEFORE damage is exchanged; run the optional
          // `onAttacker` sub-effect with boundTargets narrowed to the attacker.
          const onAttacker = (effect as unknown as { onAttacker?: ExecutableEffect }).onAttacker;
          if (onAttacker) {
            executeEffect(onAttacker, { ...ctx, boundTargets: [attackerId] });
          }
          // "Damage equal to their Mights" is current (effective) Might, so
          // turn buffs like Rampage's +2 count.
          const aMight = getEffectiveMight(attackerId, ctx);
          const dMight = getEffectiveMight(defenderId, ctx);
          // rule-id: ven-083-166 (Rampage) / rule 520 — mirror fight damage to
          // meta.damage (as `case "damage"` does) so state-based death checks,
          // end-of-turn clear, and UI see it. Read priors BEFORE addCounter so
          // counter stores that alias meta.damage don't double-apply.
          const readDamage = (id: string): number =>
            (ctx.cards.getCardMeta?.(id as CoreCardId) as Partial<RiftboundCardMeta> | undefined)
              ?.damage ?? 0;
          const attackerPrior = readDamage(attackerId);
          const defenderPrior = readDamage(defenderId);
          if (aMight > 0) {
            ctx.counters.addCounter(defenderId as CoreCardId, "damage", aMight);
            ctx.cards.updateCardMeta?.(
              defenderId as CoreCardId,
              { damage: defenderPrior + aMight } as unknown as Record<string, unknown>,
            );
          }
          if (dMight > 0) {
            ctx.counters.addCounter(attackerId as CoreCardId, "damage", dMight);
            ctx.cards.updateCardMeta?.(
              attackerId as CoreCardId,
              { damage: attackerPrior + dMight } as unknown as Record<string, unknown>,
            );
          }
        }
      }
      break;
    }

    case "play": {
      // Rule 354.2: an effect that instructs a player to play a card adds that
      // card to the chain as a pending item; its play process pauses while the
      // enclosing effect finishes (rule 354.3). The pending item keeps the turn
      // in a closed state (rule 309.1) so cleanup step 4 does not strip
      // battlefield control (rule 323.6). When the pending item is later
      // finalized its owner chooses a location (rule 355.2) via the stored
      // move-choose effect and the card enters the board there (rule 337.2).
      const targets = getTargetIds(effect, ctx);
      const turnOrder = Object.keys(ctx.draft.players);
      for (const targetId of targets) {
        const owner = ctx.cards.getCardOwner(targetId as CoreCardId) ?? ctx.playerId;
        ctx.draft.interaction = addToChain(
          ctx.draft.interaction ?? createInteractionState(),
          {
            cardId: targetId,
            controller: owner,
            effect: { target: targetId, to: "choose", type: "move" },
            triggered: true,
            type: "ability",
          },
          turnOrder,
        );
      }
      break;
    }

    case "look": {
      // Rule 435: "Look at the top N cards … [put/recycle/…]". Show a
      // reveal-and-pick pending choice with the top-N options.
      const n = resolveAmount((effect as { amount?: unknown }).amount ?? 1, ctx);
      const from = ((effect as { from?: string }).from ?? "deck") === "deck"
        ? "mainDeck"
        : (effect as { from?: string }).from!;
      const deck = ctx.zones.getCardsInZone(from as CoreZoneId, ctx.playerId as CorePlayerId);
      const topN = deck.slice(0, n).map((c) => c as string);
      if (topN.length === 0) break;
      // Rule 729 (ogn-174-298 Vision): parser emits {then:{recycle:…}} — the
      // choice is recycle-to-bottom or leave-on-top, never draw. A bare look
      // (no `then`) is the Stacked-Deck shape: draw the pick, recycle the rest.
      const lookEff = effect as {
        onPicked?: "recycle" | "banish" | "discard" | "draw" | "play";
        onRest?: "recycle";
        then?: { recycle?: unknown };
        filter?: { excludeCardTypes?: readonly string[] };
        optional?: boolean;
        reduceCost?: { energy?: number };
      };
      const visionLike = lookEff.then?.recycle !== undefined;
      const onPicked = lookEff.onPicked ?? (visionLike ? "recycle" : "draw");
      const onRest = lookEff.onRest ?? (visionLike ? undefined : "recycle");
      const lookExcluded = lookEff.filter?.excludeCardTypes;
      // rule-id: ogn-062-298-look-banish-play — "banish … then play it,
      // reducing its cost by [N]" threads the discount to the pick resolver.
      const playEnergyReduction =
        onPicked === "play" ? (lookEff.reduceCost?.energy ?? 0) : undefined;
      // Rule 435 (ogn-174-298): must match the real RevealAndPickChoice
      // shape (prompter/revealer/revealed) — the previous playerId/options
      // shape made resolvePendingChoice unenumerable and softlocked play.
      ctx.draft.pendingChoice = {
        onPicked,
        ...(onRest ? { onRest } : {}),
        ...(playEnergyReduction !== undefined ? { playEnergyReduction } : {}),
        // rule-id: ogn-062-298-look-pick-filter — "banish a unit from among
        // them" must restrict the pick; thread the effect's filter through so
        // isValidPendingPick rejects non-matching revealed cards.
        ...(lookExcluded && lookExcluded.length > 0
          ? { filter: { excludeCardTypes: [...lookExcluded] } }
          : {}),
        // rule-id: ogn-235-298-vision-optional-recycle — "You may recycle it"
        // means leave-on-top is a legal outcome; the pick must be declinable.
        ...(visionLike || lookEff.optional ? { optional: true } : {}),
        prompter: ctx.playerId,
        revealed: topN,
        revealer: ctx.playerId,
        type: "reveal-and-pick",
      };
      break;
    }

    case "reveal": {
      // Rule 354.2 (ogn-160-298 Dazzling Aurora): "reveal cards from the top
      // of your Main Deck until you reveal a <cardType>" — scan the deck
      // top-down for the first hit, banish it, play it ignoring cost (added
      // to the chain per rule 354.3), and recycle every other revealed card
      // to the bottom. Without `until` the reveal is purely informational.
      const revEff = effect as unknown as { from?: string; until?: string };
      if (revEff.until && (revEff.from ?? "deck") === "deck") {
        const revealRegistry = getGlobalCardRegistry();
        const revealDeck = ctx.zones.getCardsInZone(
          "mainDeck" as CoreZoneId,
          ctx.playerId as CorePlayerId,
        );
        const rest: string[] = [];
        let hit: string | undefined;
        for (const cardId of revealDeck) {
          const id = cardId as string;
          if (revealRegistry.get(id)?.cardType === revEff.until) {
            hit = id;
            break;
          }
          rest.push(id);
        }
        if (hit) {
          ctx.zones.moveCard({
            cardId: hit as CoreCardId,
            targetZoneId: "banishment" as CoreZoneId,
          });
          const owner = ctx.cards.getCardOwner(hit as CoreCardId) ?? ctx.playerId;
          ctx.draft.interaction = addToChain(
            ctx.draft.interaction ?? createInteractionState(),
            {
              cardId: hit,
              controller: owner,
              effect: { target: hit, to: "choose", type: "move" },
              triggered: true,
              type: "ability",
            },
            Object.keys(ctx.draft.players),
          );
        }
        for (const cardId of rest) {
          ctx.zones.moveCard({
            cardId: cardId as CoreCardId,
            position: "bottom",
            targetZoneId: "mainDeck" as CoreZoneId,
          });
        }
      }
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

      // If the revealer has no cards in hand, or every revealed card is
      // excluded by the filter, there is no valid pick — skip so play can
      // continue (otherwise pendingChoice deadlocks the game).
      const revealRegistry = getGlobalCardRegistry();
      const excluded = filter?.excludeCardTypes ?? [];
      const validPicks = revealed.filter((id) => {
        const t = revealRegistry.get(id)?.cardType;
        return !t || !excluded.includes(t);
      });
      if (validPicks.length === 0) {
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
      // Set a damage prevention shield — store on card meta
      const targets = getTargetIds(effect, ctx);
      const preventTargets = targets.length === 0 ? [ctx.sourceCardId] : targets;
      const preventAmount = resolveAmount(effect.amount ?? 0, ctx);
      for (const targetId of preventTargets) {
        ctx.cards.updateCardMeta?.(
          targetId as CoreCardId,
          {
            damagePreventionShield: preventAmount,
          } as unknown as Record<string, unknown>,
        );
      }
      break;
    }

    case "take-control": {
      // rule-id: sfd-109-221 (Akshan) — record a layered control-changing
      // effect on each target and apply it. `until-leaves` entries carry the
      // source so state-based cleanup can drop them (and fall back to the
      // next-latest effect, else the owner) once the source leaves the board.
      const targets = getTargetIds(effect, ctx);
      const untilLeaves = effect.duration === "until-leaves";
      for (const targetId of targets) {
        const meta = ctx.cards.getCardMeta?.(targetId as CoreCardId) as
          | Partial<RiftboundCardMeta>
          | undefined;
        const existing = meta?.controlEffects ?? [];
        const entry = untilLeaves
          ? { controllerId: ctx.playerId, sourceCardId: ctx.sourceCardId }
          : { controllerId: ctx.playerId };
        ctx.cards.updateCardMeta?.(
          targetId as CoreCardId,
          { controlEffects: [...existing, entry] } as unknown as Record<string, unknown>,
        );
        ctx.cards.setCardController?.(targetId as CoreCardId, ctx.playerId as CorePlayerId);
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
          { costModifier: current - amount } as unknown as Record<string, unknown>,
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
      // Fire trigger
      if (ctx.fireTriggers) {
        ctx.fireTriggers({ amount: xpAmount, playerId: ctx.playerId, type: "gain-xp" });
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

    case "name-card": {
      // Rule 762 / 383.2.b: on resolution the controller names a legal card
      // of the given type. Pause play via pendingChoice; resolvePendingChoice
      // records the chosen name on the source card's `namedCard` meta.
      const cardType =
        (effect as unknown as { cardType?: "spell" | "unit" | "gear" }).cardType ?? "spell";
      const options = getGlobalCardRegistry().listNames(cardType);
      if (options.length === 0) {
        break;
      }
      ctx.draft.pendingChoice = {
        cardType,
        options,
        prompter: ctx.playerId,
        sourceCardId: ctx.sourceCardId,
        type: "name-card",
      };
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
