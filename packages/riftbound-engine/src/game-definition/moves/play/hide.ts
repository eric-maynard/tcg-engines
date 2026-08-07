/**
 * hideCard / revealHidden moves (split from cards.ts).
 */

import type {
  CardId as CoreCardId,
  PlayerId as CorePlayerId,
  ZoneId as CoreZoneId,
  GameMoveDefinitions,
} from "@tcg/core";
import type { RiftboundCardMeta, RiftboundGameState, RiftboundMoves } from "../../../types";
import { fireTriggers } from "../../../abilities/trigger-runner";
import {
  addToChain,
  createInteractionState,
  getTurnState,
  hasShowdownPermission,
} from "../../../chain";
import { getGlobalCardRegistry } from "../../../operations/card-lookup";
import { hiddenCapacityAt } from "../../../operations/hidden-capacity";
import { computeStaticCostIncrease } from "../../../operations/static-cost-reduction";
import type { CostReductionContext } from "../../../operations/static-cost-reduction";
import { getBattlefieldZoneId, getFacedownZoneId } from "../../../zones/zone-configs";
import {
  hasStaticEffect,
  consumeEntersReadyReplacement,
  getGrantedAcceleratePlayCost,
} from "./cost";
import { spellEffectHasLegalTargets } from "./targeting";
import type { SpellEffectTargetShape } from "./targeting";

type Defs = GameMoveDefinitions<RiftboundGameState, RiftboundMoves, RiftboundCardMeta, unknown>;

/**
 * Rule 723.1.b / 723.1.b.1: the Hide action costs [C] — one Power of any
 * domain in the player's Domain Identity. Power in the pool is produced by
 * the player's own runes, so any domain with Power available qualifies.
 */
const HIDE_POWER_COST = 1;

/**
 * rule-id: ogn-264-298 — rule 517.2.b: a turn-scoped "you can hide cards
 * ignoring costs this turn" licence, installed as a `turn-static` by the
 * resolving spell and cleared in the Ending Step.
 */
function hasFreeHideLicence(state: RiftboundGameState, playerId: string): boolean {
  for (const ts of state.turnStatics ?? []) {
    if (ts.controllerId !== playerId) {
      continue;
    }
    if ((ts.effect as { type?: string } | undefined)?.type === "hide-ignoring-costs") {
      return true;
    }
  }
  return false;
}

function canAffordHide(state: RiftboundGameState, playerId: string): boolean {
  if (hasFreeHideLicence(state, playerId)) {
    return true;
  }
  const pool = state.runePools[playerId];
  if (!pool) {
    return false;
  }
  let total = 0;
  for (const v of Object.values(pool.power)) {
    total += typeof v === "number" && v > 0 ? v : 0;
  }
  return total >= HIDE_POWER_COST;
}

function deductHideCost(draft: RiftboundGameState, playerId: string): void {
  // rule-id: ogn-264-298 — the licence waives the [rainbow] entirely.
  if (hasFreeHideLicence(draft, playerId)) {
    return;
  }
  const pool = draft.runePools[playerId];
  if (!pool) {
    return;
  }
  // Pay from whichever domain has the most Power left (mirrors [rainbow]
  // payment in chain-moves).
  const key = Object.entries(pool.power)
    .filter(([, v]) => (v ?? 0) > 0)
    .sort(([, a], [, b]) => (b ?? 0) - (a ?? 0))[0]?.[0] as keyof typeof pool.power | undefined;
  if (key !== undefined) {
    pool.power[key] = Math.max(0, (pool.power[key] ?? 0) - HIDE_POWER_COST);
  }
}

/**
 * rule-id: ogn-018-298 — Noxus Saboteur, "Your opponents' [Hidden] cards can't
 * be revealed here." The static is captured as a self grant of the
 * `PreventReveal` keyword; the gate itself lives at the reveal action (rule
 * 811.1.c.3). "Here" = the battlefield the blocker occupies, and it only stops
 * players other than the blocker's controller.
 */
function revealIsPrevented(
  battlefieldId: string | undefined,
  playerId: string,
  ctx: {
    cards: { getCardController?: (id: CoreCardId) => string | undefined; getCardOwner: (id: CoreCardId) => string | undefined };
    zones: { getCardsInZone: (zoneId: CoreZoneId) => readonly CoreCardId[] };
  },
): boolean {
  if (!battlefieldId) {
    return false;
  }
  const registry = getGlobalCardRegistry();
  const here = ctx.zones.getCardsInZone(getBattlefieldZoneId(battlefieldId) as CoreZoneId);
  for (const id of here) {
    const controller = ctx.cards.getCardController?.(id) ?? ctx.cards.getCardOwner(id);
    if (controller === playerId) {
      continue;
    }
    const abilities = (registry.getAbilities(id as string) ?? []) as readonly {
      type?: string;
      effect?: { type?: string; keyword?: string };
    }[];
    if (
      abilities.some(
        (ab) =>
          ab.type === "static" &&
          ab.effect?.type === "grant-keyword" &&
          ab.effect?.keyword === "PreventReveal",
      )
    ) {
      return true;
    }
  }
  return false;
}

/**
 * rule-id: sfd-029-221 (rule 805.1.a) — a card revealed from facedown is played
 * from somewhere other than a hand, so a board static may grant it Accelerate.
 * Returns the granted cost when it is both licensed and affordable.
 */
function grantedAccelerateForReveal(
  state: RiftboundGameState,
  playerId: string,
  cardId: string,
  ctx: {
    cards: {
      getCardController?: (id: CoreCardId) => string | undefined;
      getCardOwner: (id: CoreCardId) => string | undefined;
    };
    zones: { getCardsInZone: (zoneId: CoreZoneId, playerId?: CorePlayerId) => readonly CoreCardId[] };
  },
): { energy: number; power: string[] } | undefined {
  const board: { cardId: string; controller: string | undefined }[] = [];
  const zoneIds: string[] = ["base"];
  for (const bfId of Object.keys(state.battlefields)) {
    zoneIds.push(getBattlefieldZoneId(bfId));
  }
  for (const zoneId of zoneIds) {
    for (const id of ctx.zones.getCardsInZone(zoneId as CoreZoneId)) {
      board.push({
        cardId: id as string,
        controller: ctx.cards.getCardController?.(id) ?? ctx.cards.getCardOwner(id),
      });
    }
  }
  const cost = getGrantedAcceleratePlayCost(cardId, playerId, board, false);
  if (!cost) {
    return undefined;
  }
  const pool = state.runePools[playerId];
  if (!pool || pool.energy < cost.energy) {
    return undefined;
  }
  const power = pool.power as Partial<Record<string, number>>;
  const remaining: Record<string, number> = {};
  for (const [d, v] of Object.entries(power)) {
    if (typeof v === "number" && v > 0) {
      remaining[d] = v;
    }
  }
  for (const domain of cost.power) {
    // rule 135.2.e.5.a — a pooled [rainbow] Power pays any named-domain pip.
    if ((remaining[domain] ?? 0) > 0) {
      remaining[domain] = (remaining[domain] ?? 0) - 1;
      continue;
    }
    if ((remaining.rainbow ?? 0) > 0) {
      remaining.rainbow = (remaining.rainbow ?? 0) - 1;
      continue;
    }
    return undefined;
  }
  return cost;
}

/** Deduct a granted Accelerate cost from the player's pool (rule 805.1.a). */
function payGrantedAccelerate(
  draft: RiftboundGameState,
  playerId: string,
  cost: { energy: number; power: readonly string[] },
): void {
  const pool = draft.runePools[playerId];
  if (!pool) {
    return;
  }
  pool.energy = Math.max(0, pool.energy - cost.energy);
  for (const domain of cost.power) {
    const key = domain as keyof typeof pool.power;
    if ((pool.power[key] ?? 0) > 0) {
      pool.power[key] = Math.max(0, (pool.power[key] ?? 0) - 1);
      continue;
    }
    const rainbow = "rainbow" as keyof typeof pool.power;
    if ((pool.power[rainbow] ?? 0) > 0) {
      pool.power[rainbow] = Math.max(0, (pool.power[rainbow] ?? 0) - 1);
    }
  }
}

/**
 * rule 356.1 / 356.3 / 356.4 (rule-id: sfd-146-221) — playing a card from
 * Hidden "ignores its base cost" (base → 0, rule 811.1.b / 356.1), but cost
 * INCREASES from opponents' statics are still applied on top (356.3), and no
 * discount may be applied to what is left (356.4). So the price of a flip is
 * exactly the static increase — e.g. Vex's "enemy spells cost [1][rainbow]
 * more" makes a facedown flip cost [1][rainbow].
 */
function revealSurcharge(
  state: RiftboundGameState,
  playerId: string,
  cardId: string,
  ctx: {
    cards: {
      getCardController?: (id: CoreCardId) => string | undefined;
      getCardMeta?: (id: CoreCardId) => unknown;
      getCardOwner: (id: CoreCardId) => string | undefined;
      updateCardMeta?: (id: CoreCardId, meta: Partial<RiftboundCardMeta>) => void;
    };
    zones: { getCardsInZone: (zoneId: CoreZoneId, playerId?: CorePlayerId) => readonly CoreCardId[] };
  },
): { energy: number; pips: string[] } {
  const increase = computeStaticCostIncrease(
    {
      cards: {
        getCardController: ctx.cards.getCardController,
        getCardMeta: (id: CoreCardId) =>
          ctx.cards.getCardMeta?.(id) as Partial<RiftboundCardMeta> | undefined,
        getCardOwner: ctx.cards.getCardOwner,
        updateCardMeta: (id: CoreCardId, meta: Partial<RiftboundCardMeta>) =>
          ctx.cards.updateCardMeta?.(id, meta),
      },
      draft: state,
      zones: ctx.zones,
    } as CostReductionContext,
    playerId,
    cardId,
  );
  const pips: string[] = [];
  for (const [domain, count] of Object.entries(increase.power)) {
    for (let i = 0; i < (count ?? 0); i++) {
      pips.push(domain);
    }
  }
  return { energy: Math.max(0, increase.energy), pips };
}

/** Remaining Power per domain, as a mutable tally. */
function powerTally(pool: { power: Partial<Record<string, number>> } | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [d, v] of Object.entries(pool?.power ?? {})) {
    if (typeof v === "number" && v > 0) {
      out[d] = v;
    }
  }
  return out;
}

/**
 * rule 135.2.e.5.a — a named-domain pip is payable from that domain or from
 * pooled [rainbow]; a [rainbow] pip is payable from ANY domain. Returns the
 * domains actually spent, or undefined when the pool can't cover the cost.
 */
function planPipPayment(
  remaining: Record<string, number>,
  pips: readonly string[],
): string[] | undefined {
  const spent: string[] = [];
  for (const pip of pips) {
    if (pip === "rainbow") {
      const key = Object.entries(remaining)
        .filter(([, v]) => v > 0)
        .sort(([, a], [, b]) => b - a)[0]?.[0];
      if (key === undefined) {
        return undefined;
      }
      remaining[key] -= 1;
      spent.push(key);
      continue;
    }
    if ((remaining[pip] ?? 0) > 0) {
      remaining[pip] -= 1;
      spent.push(pip);
      continue;
    }
    if ((remaining.rainbow ?? 0) > 0) {
      remaining.rainbow -= 1;
      spent.push("rainbow");
      continue;
    }
    return undefined;
  }
  return spent;
}

/** rule 356.3 — can this player pay the flip surcharge? */
function canAffordRevealSurcharge(
  state: RiftboundGameState,
  playerId: string,
  cost: { energy: number; pips: readonly string[] },
): boolean {
  if (cost.energy === 0 && cost.pips.length === 0) {
    return true;
  }
  const pool = state.runePools[playerId];
  if (!pool || pool.energy < cost.energy) {
    return false;
  }
  return planPipPayment(powerTally(pool), cost.pips) !== undefined;
}

/** rule 356.3 — deduct the flip surcharge from the player's pool. */
function payRevealSurcharge(
  draft: RiftboundGameState,
  playerId: string,
  cost: { energy: number; pips: readonly string[] },
): void {
  const pool = draft.runePools[playerId];
  if (!pool) {
    return;
  }
  pool.energy = Math.max(0, pool.energy - cost.energy);
  const spent = planPipPayment(powerTally(pool), cost.pips);
  for (const domain of spent ?? []) {
    const key = domain as keyof typeof pool.power;
    pool.power[key] = Math.max(0, (pool.power[key] ?? 0) - 1);
  }
}

/**
 * Hide a card at a Battlefield (rule 723)
 */
export const hideCard: Defs["hideCard"] = {
  condition: (state, context) => {
    if (state.status !== "playing") {
      return false;
    }
    if (state.pendingChoice) {
      return false;
    }
    // Rule 597.2: Hide is a Discretionary Action → Neutral Open only.
    const interaction = state.interaction ?? createInteractionState();
    if (getTurnState(interaction) !== "neutral-open") {
      return false;
    }
    // rule 811.1.b: "on your turn" — only the active player may Hide.
    if (state.turn.activePlayer !== context.params.playerId) {
      return false;
    }

    // rule 811.1.b / 421.2.a: Hide is legal from the hand OR the Champion Zone.
    const zone = context.zones.getCardZone(context.params.cardId as CoreCardId);
    if (zone !== "hand" && zone !== "championZone") {
      return false;
    }

    // Rule 723.1: only cards with the Hidden keyword may be Hidden.
    const registry = getGlobalCardRegistry();
    if (!registry.hasKeyword(context.params.cardId as string, "Hidden")) {
      return false;
    }

    // Rule 597.1 / 723.1.b: must be a battlefield the player controls.
    const bfId = context.params.battlefieldId;
    const bf = state.battlefields[bfId];
    if (!bf || bf.controller !== context.params.playerId) {
      return false;
    }

    // Enforce per-player hidden-card capacity at the target battlefield.
    const capacity = hiddenCapacityAt(state, context.params.playerId, bfId, context);
    const facedownZoneId = getFacedownZoneId(bfId);
    const hiddenCards = context.zones.getCardsInZone(facedownZoneId as CoreZoneId);
    let ownedHidden = 0;
    for (const hiddenId of hiddenCards) {
      if (context.cards.getCardOwner(hiddenId) === context.params.playerId) {
        ownedHidden++;
      }
    }
    if (ownedHidden >= capacity) {
      return false;
    }

    // rule-id: ogn-121-298 — Rule 723.1.b: hiding costs [C] (1 Power).
    if (!canAffordHide(state, context.params.playerId)) {
      return false;
    }

    return true;
  },
  enumerator: (state, context) => {
    if (state.status !== "playing" || state.pendingChoice) {
      return [];
    }
    const interaction = state.interaction ?? createInteractionState();
    if (getTurnState(interaction) !== "neutral-open") {
      return [];
    }
    // rule 811.1.b: "on your turn" — only the active player may Hide.
    if (state.turn.activePlayer !== (context.playerId as string)) {
      return [];
    }
    // rule-id: ogn-121-298 — Rule 723.1.b: hiding costs [C] (1 Power).
    if (!canAffordHide(state, context.playerId as string)) {
      return [];
    }
    const registry = getGlobalCardRegistry();
    const hand = context.zones.getCardsInZone(
      "hand" as CoreZoneId,
      context.playerId as CorePlayerId,
    );
    // rule 811.1.b / 421.2.a: Champion Zone cards may be hidden too.
    const championZone = context.zones.getCardsInZone(
      "championZone" as CoreZoneId,
      context.playerId as CorePlayerId,
    );
    const hiddenCards = [...hand, ...championZone].filter((id) =>
      registry.hasKeyword(id as string, "Hidden"),
    );
    if (hiddenCards.length === 0) {
      return [];
    }
    const results: { playerId: string; cardId: string; battlefieldId: string }[] = [];
    for (const [bfId, bf] of Object.entries(state.battlefields)) {
      if (bf.controller !== (context.playerId as string)) {
        continue;
      }
      const capacity = hiddenCapacityAt(state, context.playerId as string, bfId, context);
      const facedown = context.zones.getCardsInZone(getFacedownZoneId(bfId) as CoreZoneId);
      let owned = 0;
      for (const hid of facedown) {
        if (context.cards.getCardOwner(hid) === (context.playerId as string)) {
          owned++;
        }
      }
      if (owned >= capacity) {
        continue;
      }
      for (const cid of hiddenCards) {
        results.push({
          battlefieldId: bfId,
          cardId: cid as string,
          playerId: context.playerId as string,
        });
      }
    }
    return results;
  },
  reducer: (_draft, context) => {
    const { cardId, battlefieldId } = context.params;
    const { zones, counters, cards } = context;

    // rule-id: ogn-121-298 — Rule 723.1.b: pay [C] (1 Power) to hide.
    deductHideCost(_draft, context.params.playerId);

    const facedownZoneId = getFacedownZoneId(battlefieldId);

    zones.moveCard({
      cardId: cardId as CoreCardId,
      targetZoneId: facedownZoneId as CoreZoneId,
    });

    counters.setFlag(cardId as CoreCardId, "hidden", true);
    cards.updateCardMeta(
      cardId as CoreCardId,
      {
        hidden: true,
        hiddenAt: battlefieldId,
        // rule-id: ogn-121-298 — Rule 723.1.b: stamp the hide turn so the
        // card cannot be revealed until a later turn.
        hiddenOnTurn: _draft.turn?.number,
      } as Partial<RiftboundCardMeta>,
    );

    // Fire hide event
    fireTriggers(
      { cardId, playerId: context.params.playerId, type: "hide" },
      { cards, counters, draft: _draft, zones },
    );
  },
};

/**
 * rule 811.1.d / 811.1.d.2 — a card played from Hidden must choose its targets
 * from options at the battlefield it was facedown at. rule 355.8: if no legal
 * target exists under that restriction, the card can't be played at all.
 */
function hiddenSpellHasLegalTargets(
  state: RiftboundGameState,
  cardId: string,
  playerId: string,
  battlefieldId: string | undefined,
  context: {
    cards: {
      getCardController?: (id: CoreCardId) => string | undefined;
      getCardMeta?: (id: CoreCardId) => unknown;
      getCardOwner: (id: CoreCardId) => string | undefined;
    };
    zones: {
      getCardZone: (id: CoreCardId) => string | undefined;
      getCardsInZone: (zoneId: CoreZoneId, playerId?: CorePlayerId) => readonly CoreCardId[];
    };
  },
): boolean {
  if (battlefieldId === undefined) {
    return true;
  }
  const registry = getGlobalCardRegistry();
  if (registry.get(cardId)?.cardType !== "spell") {
    return true;
  }
  const spellAbility = (registry.getAbilities(cardId) ?? []).find((a) => a.type === "spell");
  const effect = spellAbility?.effect as SpellEffectTargetShape | undefined;
  if (!effect) {
    return true;
  }
  const bfZone = getBattlefieldZoneId(battlefieldId);
  return spellEffectHasLegalTargets(effect, {
    battlefieldZone: bfZone,
    cards: {
      getCardController: (c: CoreCardId) => context.cards.getCardController?.(c),
      getCardMeta: (c: CoreCardId) => context.cards.getCardMeta?.(c),
      getCardOwner: (c: CoreCardId) => context.cards.getCardOwner(c),
    },
    choosing: true,
    draft: state,
    // rule 811.1.d — restrict EVERY descriptor (even a locationless
    // "a unit") to the facedown battlefield, as resolution does.
    hiddenZone: bfZone,
    playerId,
    sourceCardId: cardId,
    sourceZone: bfZone,
    zones: {
      getCardZone: (c: CoreCardId) => context.zones.getCardZone(c),
      getCardsInZone: (z: CoreZoneId, p?: CorePlayerId) => context.zones.getCardsInZone(z, p),
    },
  } as Parameters<typeof spellEffectHasLegalTargets>[1]);
}

/**
 * Reveal and play a hidden card (rule 723.1.c.3).
 *
 * Playing a card from facedown OPENS a chain. For spell cards this
 * means we add a chain item (same as playSpell). For unit/gear cards
 * we move them to the appropriate zone (battlefield / base).
 */
export const revealHidden: Defs["revealHidden"] = {
  condition: (state, context) => {
    if (state.status !== "playing") {
      return false;
    }
    if (state.pendingChoice) {
      return false;
    }
    // rule-id: ogn-026-298 — "opponents can't play cards this turn".
    if (state.cannotPlayCardsThisTurn?.[context.params.playerId as string]) {
      return false;
    }
    const meta = context.cards.getCardMeta(context.params.cardId as CoreCardId) as
      | Partial<RiftboundCardMeta>
      | undefined;
    if (!meta?.hidden) {
      return false;
    }
    const owner = context.cards.getCardOwner(context.params.cardId as CoreCardId);
    if (owner !== context.params.playerId) {
      return false;
    }
    // rule-id: ogn-121-298 — Rule 723.1.b: "Beginning on the next player's
    // turn" — a hidden card cannot be revealed on the turn it was hidden.
    if (meta.hiddenOnTurn !== undefined && state.turn?.number !== undefined) {
      if (state.turn.number <= meta.hiddenOnTurn) {
        return false;
      }
    }
    // rule-id: ogn-018-298 — a "can't be revealed here" static at the card's
    // battlefield blocks the reveal outright.
    if (revealIsPrevented(meta.hiddenAt, context.params.playerId as string, context)) {
      return false;
    }
    // rule 811.6 / 335 / 338.1 — playing a card from a facedown zone still
    // needs Priority: [Reaction] timing adds Closed States, it does not let a
    // non-Turn-Player act in a Neutral Open State, nor a non-Focus holder act
    // in a Showdown Open State.
    {
      const turnState = getTurnState(state.interaction ?? createInteractionState());
      if (turnState === "neutral-open" && state.turn.activePlayer !== context.params.playerId) {
        return false;
      }
      if (
        turnState === "showdown-open" &&
        !hasShowdownPermission(
          state.interaction ?? createInteractionState(),
          context.params.playerId as string,
        )
      ) {
        return false;
      }
    }
    // rule 811.1.d — no legal target at the facedown battlefield ⇒ can't be played.
    if (
      !hiddenSpellHasLegalTargets(
        state,
        context.params.cardId as string,
        context.params.playerId as string,
        meta.hiddenAt,
        context,
      )
    ) {
      return false;
    }
    // rule-id: sfd-029-221 (rule 805.1.a) — the optional Accelerate cost is only
    // payable when a static licenses it and the pool covers it.
    if (
      context.params.paidAdditionalCost === true &&
      !grantedAccelerateForReveal(
        state,
        context.params.playerId as string,
        context.params.cardId as string,
        context,
      )
    ) {
      return false;
    }
    // rule 356.1 / 356.3 (rule-id: sfd-146-221) — the flip ignores the base
    // cost but must still pay any static increase an opponent imposes.
    if (
      !canAffordRevealSurcharge(
        state,
        context.params.playerId as string,
        revealSurcharge(state, context.params.playerId as string, context.params.cardId as string, context),
      )
    ) {
      return false;
    }
    return true;
  },
  // rule-id: sfd-017-221 — Rule 723.1.c.3: surface hidden cards as playable
  // moves so enumerateMoves({ validOnly: true }) (the UI move list) offers
  // revealHidden. Each candidate is re-checked against `condition`.
  enumerator: (state, context) => {
    if (state.status !== "playing" || state.pendingChoice) {
      return [];
    }
    const playerId = context.playerId as string;
    const results: { playerId: string; cardId: string; paidAdditionalCost?: boolean }[] = [];
    for (const bfId of Object.keys(state.battlefields)) {
      const facedown = context.zones.getCardsInZone(getFacedownZoneId(bfId) as CoreZoneId);
      for (const hid of facedown) {
        if (context.cards.getCardOwner(hid) !== playerId) {
          continue;
        }
        const meta = context.cards.getCardMeta(hid) as Partial<RiftboundCardMeta> | undefined;
        if (!meta?.hidden) {
          continue;
        }
        // rule 811.1.d — no legal target at the facedown battlefield ⇒ not offered.
        if (!hiddenSpellHasLegalTargets(state, hid as string, playerId, meta.hiddenAt, context)) {
          continue;
        }
        // rule 356.3 (rule-id: sfd-146-221) — an unaffordable static surcharge
        // makes the flip illegal, so don't offer it.
        if (
          !canAffordRevealSurcharge(
            state,
            playerId,
            revealSurcharge(state, playerId, hid as string, context),
          )
        ) {
          continue;
        }
        results.push({ cardId: hid as string, playerId });
        // rule-id: sfd-029-221 (rule 805.1.a) — offer the granted Accelerate as a
        // second variant so the reveal can enter ready.
        if (grantedAccelerateForReveal(state, playerId, hid as string, context)) {
          results.push({ cardId: hid as string, paidAdditionalCost: true, playerId });
        }
      }
    }
    return results;
  },
  reducer: (draft, context) => {
    const { cardId, playerId } = context.params;
    const { zones, counters, cards } = context;

    const meta = cards.getCardMeta(cardId as CoreCardId) as Partial<RiftboundCardMeta>;
    const battlefieldId = meta.hiddenAt;
    const hiddenOnTurn = meta.hiddenOnTurn;

    // rule-id: ogn-121-298 — Rule 723.1.b: defensive guard mirroring the
    // condition — never reveal on the same turn the card was hidden.
    if (
      hiddenOnTurn !== undefined &&
      draft.turn?.number !== undefined &&
      draft.turn.number <= hiddenOnTurn
    ) {
      return;
    }

    const registry = getGlobalCardRegistry();
    const def = registry.get(cardId);
    const cardType = def?.cardType;

    // rule 356.1 / 356.3 / 356.4 (rule-id: sfd-146-221) — base cost ignored,
    // opponents' static increases still paid, no discounts applied.
    payRevealSurcharge(draft, playerId, revealSurcharge(draft, playerId, cardId, { cards, zones }));

    // Clear hidden state — the card is no longer facedown regardless
    // Of its eventual destination.
    counters.setFlag(cardId as CoreCardId, "hidden", false);
    cards.updateCardMeta(
      cardId as CoreCardId,
      {
        hidden: false,
        hiddenAt: undefined,
        hiddenOnTurn: undefined,
      } as Partial<RiftboundCardMeta>,
    );

    if (cardType === "spell") {
      // Rule 723.1.c.3: playing a card from facedown opens a chain.
      // Push the spell onto the chain and move the physical card to
      // Trash (where resolved spells live).
      const abilities = registry.getAbilities(cardId) ?? [];
      const spellAbility = abilities.find((a) => a.type === "spell");
      const spellEffect = spellAbility?.effect;
      const interaction = draft.interaction ?? createInteractionState();
      const turnOrder = Object.keys(draft.players);
      draft.interaction = addToChain(
        interaction,
        {
          cardId,
          controller: playerId,
          effect: spellEffect,
          resolveTo: "trash",
          // rule-id: ogn-097-298 — Rule 723.1.d (811.1.d.2): targets for a card
          // played from Hidden are restricted to its facedown battlefield.
          ...(battlefieldId ? { triggerEvent: { fromHiddenAt: battlefieldId } } : {}),
          type: "spell",
          // rule-id: ven-015-166 — carry "This can't be countered." onto the chain item.
          ...((spellAbility as { uncounterable?: boolean } | undefined)?.uncounterable
            ? { uncounterable: true }
            : {}),
        },
        turnOrder,
      );
      // rule-id: unl-007-219 — card sits on the chain until it resolves.
      zones.moveCard({
        cardId: cardId as CoreCardId,
        targetZoneId: "chain" as CoreZoneId,
      });
      fireTriggers({ cardId, playerId, type: "play-spell" }, { cards, counters, draft, zones });
      fireTriggers(
        { cardId, cardType: "spell", playerId, type: "play-card" },
        { cards, counters, draft, zones },
      );
      // rule-id: ogn-167-298 — rule 811.1.c.3: revealing a facedown card is
      // playing it "from [Hidden]".
      fireTriggers(
        { cardId, cardType: "spell", playerId, type: "play-from-hidden" },
        { cards, counters, draft, zones },
      );
      return;
    }

    // Unit / gear / equipment: move to the associated battlefield's
    // Physical zone. The card becomes face-up and "in play" without
    // Going through the chain.
    if (battlefieldId) {
      const battlefieldZoneId = getBattlefieldZoneId(battlefieldId);
      zones.moveCard({
        cardId: cardId as CoreCardId,
        targetZoneId: battlefieldZoneId as CoreZoneId,
      });
    }

    if (cardType === "unit") {
      // rule-id: ogn-121-298 — Rule 143.4: units enter exhausted unless a
      // static enter-ready effect or an enters-ready replacement applies
      // (mirrors the normal playCard path).
      // rule-id: unl-052-219 — consume the "next unit you play" replacement
      // first so its Buff rider (if any) lands on the entering unit.
      const replacedReady = consumeEntersReadyReplacement(draft, playerId, {
        cardId,
        ctx: { cards, counters, zones },
      });
      // rule-id: sfd-029-221 (rule 805.1.a) — paying the granted Accelerate cost
      // as part of this play makes the unit enter ready.
      let paidAccelerate = false;
      if (context.params.paidAdditionalCost === true) {
        const cost = grantedAccelerateForReveal(draft, playerId, cardId, { cards, zones });
        if (cost) {
          payGrantedAccelerate(draft, playerId, cost);
          paidAccelerate = true;
        }
      }
      const entersReady = paidAccelerate || replacedReady || hasStaticEffect(cardId, "enter-ready");
      if (!entersReady) {
        counters.setFlag(cardId as CoreCardId, "exhausted", true);
      }
      // rule-id: ogn-097-298 — Rule 723.1.d (811.1.d.2): thread the facedown
      // battlefield so the play-effect's targets are restricted to it.
      fireTriggers(
        { cardId, playerId, type: "play-self", ...(battlefieldId ? { fromHiddenAt: battlefieldId } : {}) },
        { cards, counters, draft, zones },
      );
      fireTriggers(
        { cardId, cardType: "unit", playerId, type: "play-card" },
        { cards, counters, draft, zones },
      );
    }

    // rule-id: ogn-167-298 — rule 811.1.c.3: revealing a facedown card is
    // playing it "from [Hidden]" (units, gear and equipment alike).
    fireTriggers(
      { cardId, playerId, type: "play-from-hidden", ...(cardType ? { cardType } : {}) },
      { cards, counters, draft, zones },
    );
  },
};
