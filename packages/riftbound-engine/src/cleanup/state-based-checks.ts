/**
 * State-Based Checks & Cleanup
 *
 * Implements rules 518-526: automatic game state corrections that occur
 * after chain resolution, movement, showdowns, and combat.
 *
 * Cleanup steps (rule 519):
 * 1. Kill units with damage >= might (rule 520)
 * 2. Remove stale combat roles (rule 521)
 * 3. Execute state-based effects — "while"/"as long as" conditions (rule 522)
 * 4. Remove orphaned hidden cards (rule 523)
 * 5. Mark combat as pending where opposing units meet (rule 524)
 *
 * This function is designed to be called after any state mutation:
 * - After a chain item resolves
 * - After a move completes
 * - After a showdown completes
 * - After combat completes
 * - At end of turn (ending phase)
 */

import type {
  CardId as CoreCardId,
  PlayerId as CorePlayerId,
  ZoneId as CoreZoneId,
} from "@tcg/core";
import type { EffectContext, ExecutableEffect } from "../abilities/effect-executor";
import { executeEffect } from "../abilities/effect-executor";
import {
  buildConsumedKey,
  checkReplacement,
  markReplacementConsumed,
} from "../abilities/replacement-effects";
import { recalculateStaticEffects } from "../abilities/static-abilities";
import { canAffordPower } from "../game-definition/moves/chain/effect-context";
import { getGlobalCardRegistry } from "../operations/card-lookup";
import { hiddenCapacityAt } from "../operations/hidden-capacity";
import { checkVictory, type PointsIO, scoreBattlefield } from "../operations/points";
import type { PlayerId, RiftboundCardMeta, RiftboundGameState } from "../types";

/**
 * Context needed for state-based checks.
 * Passed from move reducers or flow hooks.
 */
export interface CleanupContext {
  readonly draft: RiftboundGameState;
  readonly zones: {
    moveCard: (params: { cardId: CoreCardId; targetZoneId: CoreZoneId }) => void;
    getCardsInZone: (zoneId: CoreZoneId, playerId?: CorePlayerId) => CoreCardId[];
    removeCardFromGame?: (params: { cardId: CoreCardId }) => void;
  };
  readonly cards: {
    getCardMeta: (cardId: CoreCardId) => Partial<RiftboundCardMeta> | undefined;
    getCardOwner: (cardId: CoreCardId) => string | undefined;
    getCardController?: (cardId: CoreCardId) => string | undefined;
    setCardController?: (cardId: CoreCardId, controllerId: CorePlayerId) => void;
    updateCardMeta: (cardId: CoreCardId, meta: Partial<RiftboundCardMeta>) => void;
  };
  readonly counters: {
    getCounter: (cardId: CoreCardId, counter: string) => number;
    clearCounter: (cardId: CoreCardId, counter: string) => void;
    setFlag: (cardId: CoreCardId, flag: string, value: boolean) => void;
  };
}

/** Non-board zones a token can be sent to (kill, recall, banish, recycle). */
const TOKEN_SWEEP_ZONE_IDS: readonly string[] = ["trash", "banishment", "hand", "mainDeck"];

/**
 * rule-id: 186.1 — a token in a non-board zone ceases to exist. Runs at the
 * start of a cleanup pass so a token killed in the previous pass (or by a
 * kill effect) has already had its `die` event dispatched before removal.
 */
function sweepOffBoardTokens(ctx: CleanupContext): boolean {
  const remove = ctx.zones.removeCardFromGame;
  if (!remove) {
    return false;
  }
  let removed = false;
  // Trash/hand/deck are per-player zones: a zone read without an owner misses
  // their contents, so sweep each player's copy as well as the bare zone id.
  const owners: (CorePlayerId | undefined)[] = [
    undefined,
    ...Object.keys(ctx.draft.players ?? {}).map((p) => p as CorePlayerId),
  ];
  for (const zoneId of TOKEN_SWEEP_ZONE_IDS) {
    for (const owner of owners) {
      for (const cardId of ctx.zones.getCardsInZone(zoneId as CoreZoneId, owner)) {
        if ((cardId as string).startsWith("token-")) {
          remove({ cardId });
          removed = true;
        }
      }
    }
  }
  return removed;
}

/**
 * Adapt the cleanup context into an EffectContext for running a board
 * die-replacement's effect. Real move/flow contexts are structural supersets
 * of CleanupContext, so optional operations are picked up when present and
 * stubbed otherwise. The would-be-dying unit is exposed as `trigger-source`.
 */
function buildReplacementEffectContext(
  ctx: CleanupContext,
  match: { sourceCardId: string; sourceOwner: string },
  dyingCardId: string,
): EffectContext {
  const zonesAny = ctx.zones as unknown as Partial<EffectContext["zones"]>;
  const countersAny = ctx.counters as unknown as Partial<EffectContext["counters"]>;
  const noop = () => {};
  const getCardZone =
    zonesAny.getCardZone ??
    ((id: CoreCardId) =>
      getBoardZoneIds(ctx).find((z) => ctx.zones.getCardsInZone(z as CoreZoneId).includes(id)));
  return {
    cards: ctx.cards as unknown as EffectContext["cards"],
    counters: {
      addCounter: countersAny.addCounter ?? noop,
      clearCounter: ctx.counters.clearCounter,
      removeCounter: countersAny.removeCounter ?? noop,
      setFlag: ctx.counters.setFlag,
    },
    draft: ctx.draft,
    playerId: match.sourceOwner,
    sourceCardId: match.sourceCardId,
    triggerSourceId: dyingCardId,
    zones: {
      drawCards: zonesAny.drawCards ?? noop,
      getCardZone,
      getCardsInZone: ctx.zones.getCardsInZone,
      moveCard: ctx.zones.moveCard,
    },
  };
}

/**
 * Apply a board `die` replacement (Zhonya's Hourglass ogn-077-298) to a unit
 * that is about to be killed outright — i.e. by an instruction rather than by
 * lethal damage found in a cleanup pass.
 *
 * Returns true when the death was replaced; the caller must then NOT move the
 * unit to the trash and must NOT fire its `die` triggers.
 *
 * rule 370.1.a.1 / 369.1 — the replacement is mandatory and the replaced death
 * never happens, so the unit's Deathknell (808.1.d.1) never resolves.
 */
/**
 * rule 370.1.b — a replacement effect applies only once to a given event, and
 * the kill it performs itself ("kill this instead") is not replaced again by
 * the same source. Tracks the sources whose replacement is currently running.
 */
const RUNNING_DIE_REPLACEMENTS = new Set<string>();

/**
 * rule 124.1 — damage lives in BOTH the `damage` counter and the mirrored
 * `meta.damage`; clearing only one leaves stale damage that follows the card
 * through a zone change (a unit replayed from the trash came back pre-damaged).
 */
function clearDamage(ctx: CleanupContext, cardId: string): void {
  ctx.cards.updateCardMeta(cardId as CoreCardId, { damage: 0 } as Partial<RiftboundCardMeta>);
  ctx.counters.clearCounter(cardId as CoreCardId, "damage");
}

export function applyDieReplacement(ctx: CleanupContext, cardId: string): boolean {
  if (RUNNING_DIE_REPLACEMENTS.has(cardId)) {
    return false;
  }
  const owner = ctx.cards.getCardOwner(cardId as CoreCardId) ?? "";
  const match = checkReplacement(
    { cardId, owner, type: "die" },
    { cards: ctx.cards, draft: ctx.draft, zones: ctx.zones },
  );
  if (!match || RUNNING_DIE_REPLACEMENTS.has(match.sourceCardId)) {
    return false;
  }
  markReplacementConsumed(ctx.draft, match);
  clearDamage(ctx, cardId);
  const repl = match.replacement as ExecutableEffect | "prevent" | undefined;
  if (repl && repl !== "prevent" && typeof repl === "object" && repl.type) {
    RUNNING_DIE_REPLACEMENTS.add(match.sourceCardId);
    try {
      executeEffect(repl, buildReplacementEffectContext(ctx, match, cardId));
    } finally {
      RUNNING_DIE_REPLACEMENTS.delete(match.sourceCardId);
    }
  }
  return true;
}

/**
 * Result of running state-based checks.
 */
/**
 * rule 428.5.c: a lethal-damage kill with its attribution snapshot (taken
 * before the dying unit's meta is wiped) — feeds the `die` event.
 */
export interface CleanupDeath {
  readonly cardId: string;
  readonly owner: string;
  /** rule 428.1.a.1.b: zone occupied as it died. */
  readonly diedAt?: string;
  readonly killedBy?: string;
  readonly killSource?: "spell" | "ability" | "combat";
  readonly wasStunned?: boolean;
  /** rule 702: the unit carried a buff as it died. */
  readonly wasBuffed?: boolean;
}

export interface CleanupResult {
  /** Card IDs of units killed by damage >= might */
  readonly killed: string[];
  /** Same kills as `killed`, with owner + kill attribution for the `die` event */
  readonly deaths?: CleanupDeath[];
  /** Card IDs of hidden cards removed */
  readonly hiddenRemoved: string[];
  /** Battlefield IDs where combat is now pending */
  readonly combatPending: string[];
  /** Whether any state changes occurred (may need to re-run) */
  readonly stateChanged: boolean;
}

interface ActiveDieReplacementEntry {
  replaces?: string;
  replacement?: unknown;
  targetCardIds?: readonly string[];
  /** rule 372 (ogn-023-298): "you may pay [C] to … instead" — optional, costed. */
  condition?: { type?: string; cost?: { energy?: number; power?: readonly string[] } };
  owner?: string;
  sourceCardId?: string;
}

/** rule 372: can `playerId` pay an optional replacement's `{energy, power[]}` cost right now? */
function canPayReplacementCost(
  draft: RiftboundGameState,
  playerId: string,
  cost: { energy?: number; power?: readonly string[] },
): boolean {
  const pool = draft.runePools[playerId];
  if (!pool) {
    return false;
  }
  if (pool.energy < (cost.energy ?? 0)) {
    return false;
  }
  const needed: Record<string, number> = {};
  for (const d of cost.power ?? []) {
    needed[d] = (needed[d] ?? 0) + 1;
  }
  return canAffordPower(pool.power, needed);
}

function payReplacementCost(
  draft: RiftboundGameState,
  playerId: string,
  cost: { energy?: number; power?: readonly string[] },
): void {
  const pool = draft.runePools[playerId];
  if (!pool) {
    return;
  }
  pool.energy = Math.max(0, pool.energy - (cost.energy ?? 0));
  for (const domain of cost.power ?? []) {
    const key =
      domain === "rainbow"
        ? (Object.entries(pool.power).sort(([, a], [, b]) => (b ?? 0) - (a ?? 0))[0]?.[0] as
            | keyof typeof pool.power
            | undefined)
        : (domain as keyof typeof pool.power);
    if (key !== undefined) {
      pool.power[key] = Math.max(0, (pool.power[key] ?? 0) - 1);
    }
  }
}

/**
 * rule-id: unl-007-219 — find and remove a runtime `die` replacement in
 * `draft.activeReplacements` bound to `cardId`. These are installed by the
 * effect executor when a spell resolves a targeted replacement rider; once
 * the bound unit would die the replacement applies and is spent.
 */
function consumeActiveDieReplacement(
  draft: RiftboundGameState,
  cardId: string,
  peek = false,
  preferredSource?: string,
): ActiveDieReplacementEntry | undefined {
  const active = draft.activeReplacements as ActiveDieReplacementEntry[] | undefined;
  if (!active || active.length === 0) {
    return undefined;
  }
  for (let i = 0; i < active.length; i++) {
    const entry = active[i];
    if (entry?.replaces !== "die" || !entry.targetCardIds?.includes(cardId)) {
      continue;
    }
    // rule 372: the dying unit's controller may have named which shield applies.
    if (preferredSource !== undefined && (entry.sourceCardId ?? cardId) !== preferredSource) {
      continue;
    }
    if (!peek) {
      active.splice(i, 1);
    }
    return entry;
  }
  return undefined;
}

/**
 * rule 372 (unl-007-219 × unl-175-219) — every runtime `die` replacement bound
 * to `cardId`. Two spells can both install one on the same unit ("banish it
 * instead" and "heal/recall it instead"), and its controller orders them.
 */
function peekActiveDieReplacements(
  draft: RiftboundGameState,
  cardId: string,
): ActiveDieReplacementEntry[] {
  const active = draft.activeReplacements as ActiveDieReplacementEntry[] | undefined;
  if (!active || active.length === 0) {
    return [];
  }
  return active.filter((e) => e?.replaces === "die" && e.targetCardIds?.includes(cardId));
}

/**
 * Run all state-based checks and cleanup (rules 518-526).
 *
 * Returns what changed so callers can fire appropriate triggers.
 */
export function performCleanup(ctx: CleanupContext): CleanupResult {
  const killed: string[] = [];
  const deaths: CleanupDeath[] = [];
  const hiddenRemoved: string[] = [];
  const combatPending: string[] = [];
  let stateChanged = false;

  // Step 0 — rule-id: 186.1: tokens that left the board cease to exist.
  if (sweepOffBoardTokens(ctx)) {
    stateChanged = true;
  }

  // Step 1: Kill units with damage >= might (rule 520)
  const registry = getGlobalCardRegistry();
  const allBoardZones = getBoardZoneIds(ctx);

  // Snapshot all board cards first (so removals don't affect iteration)
  const boardCards: { cardId: CoreCardId; zoneId: string }[] = [];
  for (const zoneId of allBoardZones) {
    const cardsInZone = ctx.zones.getCardsInZone(zoneId as CoreZoneId);
    for (const cardId of cardsInZone) {
      boardCards.push({ cardId, zoneId });
    }
  }

  // rule 370.4: deaths found in one cleanup pass are simultaneous, and a board
  // replacement applies to events simultaneous with its source leaving the
  // board (Soraka saves an ally dying alongside her) — so match board die
  // replacements for every damaged unit BEFORE any of them is trashed.
  const preDieReplacements = new Map<string, ReturnType<typeof checkReplacement>>();
  for (const { cardId } of boardCards) {
    const meta = ctx.cards.getCardMeta(cardId) as Partial<RiftboundCardMeta> | undefined;
    if ((meta?.damage ?? 0) > 0) {
      const owner = ctx.cards.getCardOwner(cardId) ?? "";
      preDieReplacements.set(
        cardId as string,
        checkReplacement(
          { cardId: cardId as string, owner, type: "die" },
          { cards: ctx.cards, draft: ctx.draft, zones: ctx.zones },
        ),
      );
    }
  }

  for (const { cardId } of boardCards) {
    const meta = ctx.cards.getCardMeta(cardId) as Partial<RiftboundCardMeta> | undefined;
    const damage = meta?.damage ?? 0;

    if (damage <= 0) {
      continue;
    }
    // rule 372 (ogn-023-298): this unit's death is suspended on an open
    // "you may pay … instead" prompt — leave it until the controller answers.
    const pending = ctx.draft.pendingChoice as
      | { type?: string; suspendedDeathCardId?: string }
      | undefined;
    if (pending?.type === "opt-in" && pending.suspendedDeathCardId === (cardId as string)) {
      continue;
    }

    // Look up base might from card definition
    const def = registry.get(cardId as string);
    const baseMight = def?.might ?? 0;

    // Only units have might — skip non-units
    if (baseMight <= 0) {
      continue;
    }

    // rule-id: ogs-002-024 — lethal check compares damage against the unit's
    // *effective* Might (base + buffs + modifiers + static + equipment), not
    // the printed value, so a +2 Mech with 3 base Might survives 3 damage.
    let equipBonus = 0;
    for (const equipId of meta?.equippedWith ?? []) {
      equipBonus += registry.getMightBonus(equipId as string);
    }
    const effectiveMight = Math.max(
      0,
      baseMight +
        (meta?.buffed ? 1 : 0) +
        (meta?.extraBuffs ?? 0) +
        (meta?.mightModifier ?? 0) +
        (meta?.staticMightBonus ?? 0) +
        equipBonus,
    );

    if (damage >= effectiveMight) {
      // rule-id: unl-007-219 — runtime die-replacements bound to this unit
      // (installed by a resolved spell: "If it would die this turn, banish it
      // instead") take precedence over the normal kill (rule 571-573).
      // rule 372: when two replacement effects both apply to this death, the
      // controller of the dying object chooses which one applies (the other
      // never sees the event — rule 370.2). Ask once, then honour the answer.
      let boardPeek = preDieReplacements.get(cardId as string) ?? null;
      if (
        boardPeek?.duration === "next" &&
        ctx.draft.consumedNextReplacements?.[
          buildConsumedKey(boardPeek.sourceCardId, boardPeek.abilityIndex)
        ]
      ) {
        boardPeek = null;
      }
      // rule 372: an optional "you may pay … instead" shield carries its own
      // prompt, so it never joins the ordering choice.
      const boundPeek = consumeActiveDieReplacement(ctx.draft, cardId as string, true);
      const boundPeeks = peekActiveDieReplacements(ctx.draft, cardId as string).filter(
        (e) => e.condition?.type !== "pay-cost",
      );
      // rule 372 (unl-007-219 × unl-175-219): Smite's "banish it instead" and
      // Tactical Retreat's shield are BOTH runtime-bound — two replacements for
      // one death with no board ability involved, so they need the same
      // ordering choice the board-vs-bound pair already gets.
      const orderOptions =
        boundPeek && boardPeek && boundPeek.condition?.type !== "pay-cost"
          ? [boardPeek.sourceCardId, boundPeek.sourceCardId ?? (cardId as string)]
          : !boardPeek && boundPeeks.length > 1
            ? boundPeeks.map((e) => e.sourceCardId ?? (cardId as string))
            : [];
      let preferBound = true;
      let pickedBoundSource: string | undefined;
      if (orderOptions.length > 1) {
        const orders = (ctx.draft as { replacementOrderChoices?: Record<string, string> })
          .replacementOrderChoices;
        const picked = orders?.[cardId as string];
        if (picked === undefined) {
          if (ctx.draft.pendingChoice) {
            continue;
          }
          ctx.draft.pendingChoice = {
            effect: { type: "noop" },
            options: orderOptions,
            playerId: ctx.cards.getCardController?.(cardId) ?? ctx.cards.getCardOwner(cardId) ?? "",
            remaining: 1,
            replacementOrderFor: cardId as string,
            sourceCardId: cardId as string,
            type: "choose-target",
          } as RiftboundGameState["pendingChoice"];
          stateChanged = true;
          continue;
        }
        preferBound = !boardPeek || picked !== boardPeek.sourceCardId;
        if (preferBound) {
          pickedBoundSource = picked;
        }
        if (orders) {
          delete orders[cardId as string];
        }
      }
      const activeDie = preferBound
        ? consumeActiveDieReplacement(ctx.draft, cardId as string, false, pickedBoundSource)
        : undefined;
      // rule 372 (ogn-023-298): "you may pay [C] to … instead" — an optional,
      // costed replacement. Unpayable ⇒ the death proceeds normally (the
      // single-fire entry is still spent: "the next time" has passed).
      // Payable ⇒ suspend the death and ask the controller; on accept the
      // opt-in reducer charges the cost and runs the replacement effect with
      // this unit as "it", on decline the next cleanup pass kills it.
      const payCost =
        activeDie?.condition?.type === "pay-cost" ? activeDie.condition.cost : undefined;
      let autoPaid = false;
      if (activeDie && payCost) {
        const payer =
          activeDie.owner ??
          ctx.cards.getCardController?.(cardId) ??
          ctx.cards.getCardOwner(cardId) ??
          "";
        const replEffect = activeDie.replacement as ExecutableEffect | undefined;
        const affordable =
          !!replEffect && typeof replEffect === "object" && canPayReplacementCost(ctx.draft, payer, payCost);
        if (affordable && !ctx.draft.pendingChoice) {
          const sourceCardId = activeDie.sourceCardId ?? (cardId as string);
          ctx.draft.pendingChoice = {
            playerId: payer,
            resolved: {
              cardId: sourceCardId,
              controller: payer,
              effect: replEffect,
              id: `die-replacement-${cardId as string}`,
              optInCost: payCost,
              targets: [cardId as string],
              triggerEvent: { cardId: cardId as string, type: "die" },
              triggered: true,
              type: "ability",
            },
            sourceCardId,
            suspendedDeathCardId: cardId as string,
            type: "opt-in",
          } as RiftboundGameState["pendingChoice"];
          stateChanged = true;
          continue;
        }
        if (affordable) {
          // Another prompt is already open — can't ask; honour the shield by paying for it.
          payReplacementCost(ctx.draft, payer, payCost);
          autoPaid = true;
        }
      }
      if (activeDie && (!payCost || autoPaid)) {
        const repl = activeDie.replacement as ExecutableEffect | "prevent" | undefined;
        if (repl && repl !== "prevent" && repl.type === "banish") {
          const unitMeta = ctx.cards.getCardMeta(cardId) as Partial<RiftboundCardMeta> | undefined;
          for (const equipId of unitMeta?.equippedWith ?? []) {
            ctx.cards.updateCardMeta(
              equipId as CoreCardId,
              { attachedTo: undefined, copiedFromCardId: undefined } as Partial<RiftboundCardMeta>,
            );
            ctx.zones.moveCard({ cardId: equipId as CoreCardId, targetZoneId: "base" as CoreZoneId });
          }
          ctx.zones.moveCard({ cardId, targetZoneId: "banishment" as CoreZoneId });
          ctx.cards.updateCardMeta(cardId, {
            buffed: false,
            combatMightModifier: 0,
            combatRole: null,
            damage: 0,
            equippedWith: undefined,
            exhausted: false,
            grantedKeywords: undefined,
            mightModifier: 0,
            stunned: false,
          } as Partial<RiftboundCardMeta>);
        } else {
          clearDamage(ctx, cardId as string);
          // rule 370.1.a.1 (ogn-023-298): run the replacement's own effect
          // ("heal it, exhaust it, and recall it") with this unit as "it".
          if (repl && repl !== "prevent" && typeof repl === "object" && repl.type) {
            const owner = ctx.cards.getCardOwner(cardId) ?? "";
            executeEffect(repl, {
              ...buildReplacementEffectContext(
                ctx,
                {
                  sourceCardId: activeDie.sourceCardId ?? (cardId as string),
                  sourceOwner: activeDie.owner ?? owner,
                },
                cardId as string,
              ),
              boundTargets: [cardId as string],
            });
          }
        }
        stateChanged = true;
        continue;
      }

      // Check for replacement effects ("instead of dying...") (rule 571-575)
      const owner = ctx.cards.getCardOwner(cardId) ?? "";
      let replacementMatch = preDieReplacements.get(cardId as string) ?? null;
      if (
        replacementMatch?.duration === "next" &&
        ctx.draft.consumedNextReplacements?.[
          buildConsumedKey(replacementMatch.sourceCardId, replacementMatch.abilityIndex)
        ]
      ) {
        // A single-fire replacement already spent on a simultaneous death — re-scan live.
        replacementMatch = checkReplacement(
          { cardId: cardId as string, owner, type: "die" },
          { cards: ctx.cards, draft: ctx.draft, zones: ctx.zones },
        );
      }
      if (replacementMatch) {
        // rule 572 / 370.1.a.1: the death never happens; the replacement's own
        // effect (e.g. "kill this instead. Heal that unit, exhaust it, and
        // recall it") runs in its place, with the would-be-dying unit as "it".
        // Consume single-fire "next"-duration death replacements so they
        // Don't re-trigger on subsequent deaths this turn.
        markReplacementConsumed(ctx.draft, replacementMatch);
        stateChanged = true;
        // Clear damage so it doesn't re-trigger next cleanup pass
        clearDamage(ctx, cardId as string);
        const repl = replacementMatch.replacement as ExecutableEffect | "prevent" | undefined;
        if (repl && repl !== "prevent" && typeof repl === "object" && repl.type) {
          executeEffect(repl, buildReplacementEffectContext(ctx, replacementMatch, cardId as string));
        }
        continue;
      }

      // Detach any equipment before killing (equipment returns to owner's base).
      // Also clears `copiedFromCardId` so Svellsongur stops exposing the
      // Dying unit's abilities once it's no longer attached.
      const unitMeta = ctx.cards.getCardMeta(cardId) as Partial<RiftboundCardMeta> | undefined;
      const equippedWith = unitMeta?.equippedWith ?? [];
      for (const equipId of equippedWith) {
        ctx.cards.updateCardMeta(
          equipId as CoreCardId,
          {
            attachedTo: undefined,
            copiedFromCardId: undefined,
          } as Partial<RiftboundCardMeta>,
        );
        ctx.zones.moveCard({
          cardId: equipId as CoreCardId,
          targetZoneId: "base" as CoreZoneId,
        });
      }

      // rule 428.1.a.1.b: remember where it died before the zone change.
      const diedAt = ctx.zones.getCardZone?.(cardId) as string | undefined;

      // Kill this unit — move to trash
      ctx.zones.moveCard({
        cardId,
        targetZoneId: "trash" as CoreZoneId,
      });

      // rule 428.5.c: snapshot kill attribution before the meta wipe below.
      deaths.push({
        cardId: cardId as string,
        diedAt,
        killSource: unitMeta?.lastDamageSource,
        killedBy: unitMeta?.lastDamagedBy,
        owner,
        wasBuffed: unitMeta?.buffed === true,
        wasStunned: unitMeta?.stunned === true,
      });

      // Clear all temporary metadata (rule 170+: zone change clears all mods)
      ctx.cards.updateCardMeta(cardId, {
        buffed: false,
        combatMightModifier: 0,
        combatRole: null,
        damage: 0,
        equippedWith: undefined,
        exhausted: false,
        grantedKeywords: undefined,
        lastDamageSource: undefined,
        lastDamagedBy: undefined,
        mightModifier: 0,
        stunned: false,
      } as Partial<RiftboundCardMeta>);

      killed.push(cardId as string);
      stateChanged = true;
    }
  }

  // Step 2: Remove stale combat roles (rule 521)
  // Units not at a battlefield where combat is occurring lose their combat role
  for (const zoneId of allBoardZones) {
    const cardsInZone = ctx.zones.getCardsInZone(zoneId as CoreZoneId);
    const isBattlefield = (zoneId as string).startsWith("battlefield-");

    for (const cardId of cardsInZone) {
      const meta = ctx.cards.getCardMeta(cardId) as Partial<RiftboundCardMeta> | undefined;
      if (meta?.combatRole && !isBattlefield) {
        ctx.cards.updateCardMeta(cardId, {
          combatRole: null,
        } as Partial<RiftboundCardMeta>);
        stateChanged = true;
      }
    }

    // rule 464.2.c.3.a: a unit that becomes present at a battlefield during an
    // ongoing combat gains Attacker/Defender at the next cleanup.
    if (!isBattlefield) {
      continue;
    }
    const bfId = (zoneId as string).slice("battlefield-".length);
    const bf = ctx.draft.battlefields[bfId];
    if (!bf?.contested || bf.showdownComplete || !bf.contestedBy) {
      continue;
    }
    // Only while a combat showdown is actually running here — a contested flag
    // alone can outlive the showdown that set it.
    const combatRunning = (ctx.draft.interaction?.showdownStack ?? []).some(
      (sd) => sd.active && sd.isCombatShowdown && sd.battlefieldId === bfId,
    );
    if (!combatRunning) {
      continue;
    }
    const units = cardsInZone.filter((id) => registry.getCardType(id as string) === "unit");
    const attackerSide = bf.contestedBy;
    const bothSidesPresent =
      units.some((id) => ctx.cards.getCardOwner(id) === attackerSide) &&
      units.some((id) => ctx.cards.getCardOwner(id) !== attackerSide);
    if (!bothSidesPresent) {
      continue;
    }
    for (const cardId of units) {
      const meta = ctx.cards.getCardMeta(cardId) as Partial<RiftboundCardMeta> | undefined;
      if (meta?.combatRole) {
        continue;
      }
      ctx.cards.updateCardMeta(cardId, {
        combatRole: ctx.cards.getCardOwner(cardId) === attackerSide ? "attacker" : "defender",
      } as Partial<RiftboundCardMeta>);
      stateChanged = true;
    }
  }

  // Step 3: Recalculate static/passive ability effects (rule 522)
  // Strip and re-apply all "While X" / "As long as" continuous effects
  if (recalculateStaticEffects({ cards: ctx.cards, draft: ctx.draft, zones: ctx.zones })) {
    stateChanged = true;
  }

  // Step 4: Remove orphaned hidden cards (rule 323.7 / 107.3.d)
  // A Facedown Zone belongs to the battlefield's CONTROLLER: a card there is
  // trashed only once its owner stops controlling that battlefield. Losing the
  // last unit there is not itself enough — control only changes in an Open
  // State (step 6 / rule 190.4.b), so a defender whose last unit dies mid-combat
  // keeps its facedown card and may still play it.
  for (const bfId of Object.keys(ctx.draft.battlefields)) {
    const facedownZoneId = `facedown-${bfId}` as CoreZoneId;

    const hiddenCards = ctx.zones.getCardsInZone(facedownZoneId);
    if (hiddenCards.length === 0) {
      continue;
    }

    const bfController = ctx.draft.battlefields[bfId]?.controller ?? null;

    for (const hiddenCardId of hiddenCards) {
      const hiddenOwner =
        ctx.cards.getCardController?.(hiddenCardId) ?? ctx.cards.getCardOwner(hiddenCardId) ?? "";

      if (bfController !== hiddenOwner) {
        // Remove hidden card to trash
        ctx.zones.moveCard({
          cardId: hiddenCardId,
          targetZoneId: "trash" as CoreZoneId,
        });
        ctx.cards.updateCardMeta(hiddenCardId, {
          hidden: false,
          hiddenAt: undefined,
        } as Partial<RiftboundCardMeta>);
        hiddenRemoved.push(hiddenCardId as string);
        stateChanged = true;
      }
    }
  }

  // Step 4b: rule 107.3.b.2 / 421.4 — a Facedown Zone holding more cards than
  // its (now reduced) maximum is trimmed immediately: the zone's CONTROLLER
  // chooses which card to trash, and the trashed card is revealed. One prompt
  // at a time; the check re-runs after each answer until the zone fits.
  for (const bfId of Object.keys(ctx.draft.battlefields)) {
    if (ctx.draft.pendingChoice) {
      break;
    }
    const hiddenCards = ctx.zones.getCardsInZone(`facedown-${bfId}` as CoreZoneId);
    if (hiddenCards.length < 2) {
      continue;
    }
    const bfController = ctx.draft.battlefields[bfId]?.controller ?? null;
    if (bfController === null) {
      continue;
    }
    if (hiddenCards.length <= hiddenCapacityAt(ctx.draft, bfController, bfId, ctx)) {
      continue;
    }
    ctx.draft.pendingChoice = {
      effect: { type: "trash-facedown" },
      options: [...hiddenCards] as CoreCardId[],
      playerId: bfController,
      remaining: 1,
      sourceCardId: hiddenCards[0],
      type: "choose-target",
    } as typeof ctx.draft.pendingChoice;
    stateChanged = true;
  }

  // Step 5: Auto-recall gear from battlefields to base (rule 518)
  for (const bfId of Object.keys(ctx.draft.battlefields)) {
    const bfZoneId = `battlefield-${bfId}` as CoreZoneId;
    const cardsAtBf = ctx.zones.getCardsInZone(bfZoneId);

    for (const cardId of cardsAtBf) {
      const def = registry.get(cardId as string);
      // Only auto-recall gear/equipment (never units)
      if (def?.cardType !== "gear" && def?.cardType !== "equipment") {
        continue;
      }
      const meta = ctx.cards.getCardMeta(cardId) as Partial<RiftboundCardMeta> | undefined;
      if (meta?.attachedTo) {
        // rule 457.1 / 323.7: once its host leaves the board the Equipment is
        // loose at the battlefield — detach it and recall it to base. Any
        // removal path (kill effect, bounce, banish) can orphan it, so the
        // check lives here rather than in each remover.
        const hostZone = ctx.zones.getCardZone?.(meta.attachedTo as CoreCardId) as
          | string
          | undefined;
        const hostOnBoard = hostZone === "base" || hostZone?.startsWith("battlefield-") === true;
        if (hostOnBoard) {
          continue;
        }
        ctx.cards.updateCardMeta(cardId, {
          attachedTo: undefined,
        } as Partial<RiftboundCardMeta>);
      }
      // rule 435.4.a / 318: an Equipment detached from a unit AT a battlefield
      // is present at that battlefield, so this Cleanup recalls it to base —
      // exactly like any other loose gear (rule 518).
      ctx.zones.moveCard({
        cardId,
        targetZoneId: "base" as CoreZoneId,
      });
      stateChanged = true;
    }
  }

  // Step 5b: Return exile-tracked cards when the tracking card leaves the
  // Board (The Zero Drive). Equipment with `tracksExiledCards` stores each
  // Banished card's ID in `exiledByThis`. When the equipment is no longer
  // On the board (base / battlefield), all tracked cards are played back to
  // Their owner's base and the list is cleared.
  const offBoardZoneIds: string[] = ["trash", "banishment", "hand", "mainDeck"];
  const scannedTrackers = new Set<string>();
  for (const zoneId of offBoardZoneIds) {
    const cardsInZone = ctx.zones.getCardsInZone(zoneId as CoreZoneId);
    for (const cardId of cardsInZone) {
      const key = cardId as string;
      if (scannedTrackers.has(key)) {
        continue;
      }
      scannedTrackers.add(key);
      const def = registry.get(key);
      if (def?.tracksExiledCards !== true) {
        continue;
      }
      const meta = ctx.cards.getCardMeta(cardId) as Partial<RiftboundCardMeta> | undefined;
      const tracked = meta?.exiledByThis ?? [];
      if (tracked.length === 0) {
        continue;
      }
      for (const exiledId of tracked) {
        ctx.zones.moveCard({
          cardId: exiledId as CoreCardId,
          targetZoneId: "base" as CoreZoneId,
        });
      }
      ctx.cards.updateCardMeta(cardId, {
        exiledByThis: undefined,
      } as Partial<RiftboundCardMeta>);
      stateChanged = true;
    }
  }

  // Step 5c — rule-id: sfd-109-221 (Akshan "You control it until I leave the
  // board"): re-layer control-changing effects. Entries whose source left the
  // board expire; the latest surviving entry sets the controller, and with
  // none left the permanent reverts to its owner.
  if (ctx.cards.setCardController) {
    const liveBoard = new Set<string>();
    for (const zoneId of getBoardZoneIds(ctx)) {
      for (const id of ctx.zones.getCardsInZone(zoneId as CoreZoneId)) {
        liveBoard.add(id as string);
      }
    }
    for (const id of liveBoard) {
      const cardId = id as CoreCardId;
      const meta = ctx.cards.getCardMeta(cardId) as Partial<RiftboundCardMeta> | undefined;
      const effects = meta?.controlEffects;
      if (!effects || effects.length === 0) {
        continue;
      }
      const surviving = effects.filter(
        (e) => e.sourceCardId === undefined || liveBoard.has(e.sourceCardId),
      );
      if (surviving.length !== effects.length) {
        ctx.cards.updateCardMeta(cardId, {
          controlEffects: surviving.length > 0 ? surviving : undefined,
        } as Partial<RiftboundCardMeta>);
        stateChanged = true;
      }
      const desired =
        surviving[surviving.length - 1]?.controllerId ?? ctx.cards.getCardOwner(cardId);
      const current = ctx.cards.getCardController?.(cardId) ?? ctx.cards.getCardOwner(cardId);
      if (desired && desired !== current) {
        ctx.cards.setCardController(cardId, desired as CorePlayerId);
        stateChanged = true;
      }
    }
  }

  // Step 6: Battlefield control + combat staging (rules 323.6, 323.13)
  for (const [bfId, bf] of Object.entries(ctx.draft.battlefields)) {
    const bfZoneId = `battlefield-${bfId}` as CoreZoneId;
    const unitsAtBf = ctx.zones.getCardsInZone(bfZoneId);

    // Rule 323.6: a player loses control of a Battlefield they control if
    // they no longer have a Unit at that Battlefield — but only during an
    // Open State (no chain, no showdown; rule 190.4.c). Pending items keep
    // the chain closed so a unit banished-then-replayed by a spell keeps its
    // battlefield controlled through the sequence.
    // rule-id: ogn-276-298-arcane-shift-replay-keeps-control — an outstanding
    // pendingChoice (e.g. the replayed unit's choose-destination) means the
    // last chain item has not finished resolving, so the state is still
    // Closed even though the chain itself has emptied.
    // rule 309.1 / 190.4.c — units reaped in THIS pass have not had their `die`
    // event dispatched yet, so the Deathknell / dies-triggers they generate are
    // not on the chain when step 6 runs. Those pending items keep the turn in a
    // Closed State, so defer the 323.6 check to the next maintenance pass (the
    // runner always makes one after a pass that killed something).
    // rule-id: sfd-165-221 (Glasc Mixologist) — his Deathknell may play a unit
    // back to the battlefield he just died at, which requires that battlefield
    // to still be controlled by his controller.
    const isOpenState =
      !ctx.draft.interaction?.chain?.active &&
      (ctx.draft.interaction?.showdownStack?.length ?? 0) === 0 &&
      !ctx.draft.pendingChoice &&
      killed.length === 0;
    if (bf.controller && isOpenState) {
      // rule 323.6 / 127.1: "have a Unit there" follows CONTROL, not ownership — a unit
      // stolen by e.g. Hostile Takeover holds the battlefield for its new controller.
      const controllerOf = (id: CoreCardId) =>
        ctx.cards.getCardController?.(id) ?? ctx.cards.getCardOwner(id);
      const unitControllers = new Set<string>();
      for (const id of unitsAtBf) {
        if (registry.getCardType(id as string) !== "unit") {
          continue;
        }
        const c = controllerOf(id);
        if (c) {
          unitControllers.add(c);
        }
      }
      if (!unitControllers.has(bf.controller)) {
        // rule 190.3.a: a unit that "otherwise becomes present" (a control change, no move)
        // at a battlefield its controller doesn't control contests it. With no other enemy
        // units there the showdown is non-combat and settles straight into a conquer.
        if (unitControllers.size === 1 && !bf.contested) {
          const conqueror = [...unitControllers][0] as string;
          conquerByPresence(ctx, bfId, conqueror);
        } else {
          bf.controller = null;
        }
        stateChanged = true;
      }
    }

    if (unitsAtBf.length < 2) {
      continue;
    }

    const owners = new Set<string>();
    for (const unitId of unitsAtBf) {
      const owner = ctx.cards.getCardOwner(unitId) ?? "";
      if (owner) {
        owners.add(owner);
      }
    }

    if (owners.size >= 2 && !bf.contested) {
      combatPending.push(bfId);
      stateChanged = true;
    }
  }

  // rule 472 / 323.1 — the victory check is a Cleanup task: the only place a
  // points win ends the game (no-op while a Chain Item is resolving, rule 321).
  checkVictory(ctx.draft, { io: ctx });

  return { combatPending, deaths, hiddenRemoved, killed, stateChanged };
}

/**
 * rule 190.3.a / 630.1 — the sole player with units at a battlefield they don't control takes
 * it and scores, exactly as a non-combat showdown close would.
 */
function conquerByPresence(ctx: CleanupContext, bfId: string, playerId: string): void {
  const draft = ctx.draft;
  const bf = draft.battlefields[bfId];
  if (!bf) {
    return;
  }
  const previousController = bf.controller;
  bf.controller = playerId;
  bf.contested = false;
  bf.contestedBy = undefined;
  const zonesAny = ctx.zones as unknown as Partial<PointsIO["zones"]>;
  scoreBattlefield(
    draft,
    playerId as PlayerId,
    bfId,
    "conquer",
    {
      cards: ctx.cards,
      zones: { drawCards: zonesAny.drawCards ?? (() => {}), getCardsInZone: ctx.zones.getCardsInZone },
    },
    { previousController },
  );
}

/**
 * Run cleanup repeatedly until no more state changes occur.
 * This handles cascading effects (e.g., killing a unit triggers deathknell,
 * which deals damage, which kills another unit).
 *
 * Safety valve: max 10 iterations to prevent infinite loops.
 */
export function performFullCleanup(ctx: CleanupContext): CleanupResult {
  const allKilled: string[] = [];
  const allHiddenRemoved: string[] = [];
  const allCombatPending: string[] = [];

  for (let i = 0; i < 10; i++) {
    const result = performCleanup(ctx);
    allKilled.push(...result.killed);
    allHiddenRemoved.push(...result.hiddenRemoved);
    allCombatPending.push(...result.combatPending);

    if (!result.stateChanged) {
      break;
    }
  }

  return {
    combatPending: allCombatPending,
    hiddenRemoved: allHiddenRemoved,
    killed: allKilled,
    stateChanged:
      allKilled.length > 0 || allHiddenRemoved.length > 0 || allCombatPending.length > 0,
  };
}

/**
 * Get all zone IDs where cards could be on the board.
 */
function getBoardZoneIds(ctx: CleanupContext): string[] {
  const zones: string[] = ["base"];

  for (const bfId of Object.keys(ctx.draft.battlefields)) {
    zones.push(`battlefield-${bfId}`);
  }

  return zones;
}
