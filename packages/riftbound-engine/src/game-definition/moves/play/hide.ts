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
import { casterChosenTarget } from "../../../abilities/trigger-target-lock";
import { resolveTarget } from "../../../abilities/target-resolver";
import {
  addToChain,
  advanceFocusAfterPlay,
  createInteractionState,
  getActiveShowdown,
  getTurnState,
} from "../../../chain";
import { reactionWindowOpen } from "./reaction-window";
import { getGlobalCardRegistry } from "../../../operations/card-lookup";
import { hiddenCapacityAt } from "../../../operations/hidden-capacity";
import { battlefieldForbidsUnitPlays, playIsForbidden } from "../../../abilities/play-restrictions";
import { computeStaticCostIncrease } from "../../../operations/static-cost-reduction";
import type { CostReductionContext } from "../../../operations/static-cost-reduction";
import { getBattlefieldZoneId, getFacedownZoneId } from "../../../zones/zone-configs";
import {
  getCardEffectiveMight,
  getGrantedAcceleratePlayCost,
  getOptionalPlayCost,
  spendablePowerPool,
} from "./cost";
import { enterPlayedPermanent } from "./play-pipeline";
import {
  beginRevealPairLock,
  beginRevealSlotLock,
  chargeDeflectFor,
  filterDeflectAffordable,
  isSinglePickSlot,
} from "./reveal-target-lock";
import {
  collectSequenceTargetSlots,
  enumerateSubsetsUpTo,
  enumerateTargetPairs,
  findSequenceLeadTarget,
  hiddenChoiceIsPulledIn,
  pairEffectRoles,
  spellEffectHasLegalTargets,
} from "./targeting";
import type { SpellEffectTargetShape } from "./targeting";

type Defs = GameMoveDefinitions<RiftboundGameState, RiftboundMoves, RiftboundCardMeta, unknown>;

/**
 * Rule 723.1.b / 723.1.b.1: the Hide action costs [C] — one Power of any
 * domain in the player's Domain Identity. Power in the pool is produced by
 * the player's own runes, so any domain with Power available qualifies.
 */
const HIDE_POWER_COST = 1;

/** rule 383.3.d — put the triggered items added since `from` into `batch` (no-op without one). */
function stampBatch(draft: RiftboundGameState, from: number, batch: string | undefined): void {
  const items = draft.interaction?.chain?.items;
  if (!items || batch === undefined) {
    return;
  }
  for (let i = from; i < items.length; i++) {
    if (items[i].triggered === true) {
      items[i] = { ...items[i], triggerBatch: batch };
    }
  }
}

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

/**
 * rule-id: ogn-263-298 — rule 723.1.b + 350.2: a static "you may pay [1] to
 * hide a card with [Hidden] instead of [rainbow]" is an ALTERNATIVE Hide cost
 * owned by the player, not by the card being hidden. Any permanent the player
 * controls that statically grants `HideCostReduction` opens it.
 */
function hasEnergyHideAlternative(playerId: string, ctx: HideScanContext | undefined): boolean {
  if (!ctx) {
    return false;
  }
  const registry = getGlobalCardRegistry();
  const ids: string[] = [];
  for (const zoneId of ["legendZone", "base"]) {
    ids.push(
      ...ctx.zones
        .getCardsInZone(zoneId as CoreZoneId, playerId as CorePlayerId)
        .map((id) => id as string),
    );
  }
  for (const id of ids) {
    const grants = (registry.getAbilities(id) ?? []) as {
      type?: string;
      effect?: { type?: string; keyword?: string };
    }[];
    if (
      grants.some(
        (a) =>
          a.type === "static" &&
          a.effect?.type === "grant-keyword" &&
          a.effect.keyword === "HideCostReduction",
      )
    ) {
      return true;
    }
  }
  return false;
}

/** Minimal zone accessor the Hide-cost scan needs (condition/enumerator/reducer all supply it). */
interface HideScanContext {
  readonly zones: {
    getCardsInZone: (zoneId: CoreZoneId, playerId?: CorePlayerId) => readonly CoreCardId[];
  };
}

function canAffordHide(
  state: RiftboundGameState,
  playerId: string,
  ctx?: HideScanContext,
): boolean {
  if (hasFreeHideLicence(state, playerId)) {
    return true;
  }
  // rule-id: ogn-263-298 — the alternative [1] is enough on its own.
  if (
    (state.runePools[playerId]?.energy ?? 0) >= HIDE_POWER_COST &&
    hasEnergyHideAlternative(playerId, ctx)
  ) {
    return true;
  }
  const pool = state.runePools[playerId];
  if (!pool) {
    return false;
  }
  // rule 811.1.c.1 / 429.4 (sfd-189-221) — hiding a card is not playing it, so
  // Power earmarked "use only to play …" can never pay the [rainbow] Hide cost.
  let total = 0;
  for (const v of Object.values(spendablePowerPool(state, playerId, undefined))) {
    total += typeof v === "number" && v > 0 ? v : 0;
  }
  return total >= HIDE_POWER_COST;
}

function deductHideCost(
  draft: RiftboundGameState,
  playerId: string,
  ctx?: HideScanContext,
): void {
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
  // rule 429.4: spend only Power the earmark leaves free.
  const key = Object.entries(spendablePowerPool(draft, playerId, undefined))
    .filter(([, v]) => (v ?? 0) > 0)
    .sort(([, a], [, b]) => (b ?? 0) - (a ?? 0))[0]?.[0] as keyof typeof pool.power | undefined;
  if (key !== undefined) {
    pool.power[key] = Math.max(0, (pool.power[key] ?? 0) - HIDE_POWER_COST);
    return;
  }
  // rule-id: ogn-263-298 — no Power left to spend: the alternative [1] pays
  // instead ("you MAY pay [1] … instead", so exactly one of the two is spent).
  if (pool.energy >= HIDE_POWER_COST && hasEnergyHideAlternative(playerId, ctx)) {
    pool.energy -= HIDE_POWER_COST;
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

/**
 * rule 356.2 / 811.1.b (rule-id: unl-028-219) — playing a card from Hidden
 * ignores its BASE cost only; the card's own optional additional cost ("You may
 * pay [fury] as an additional cost to play me") is still offered and still paid
 * from the pool. Returns the resource cost when the player can afford it.
 */
function ownOptionalPayCostForReveal(
  state: RiftboundGameState,
  playerId: string,
  cardId: string,
): { energy: number; power: string[] } | undefined {
  const optional = getOptionalPlayCost(cardId);
  if (!optional || optional.kind !== "pay" || optional.mandatory) {
    return undefined;
  }
  const raw = optional.cost as
    | { energy?: number; power?: readonly string[]; xp?: number }
    | undefined;
  // XP and other non-pool costs are out of scope for the flip path.
  if (!raw || (raw.xp ?? 0) > 0) {
    return undefined;
  }
  const cost = { energy: raw.energy ?? 0, power: [...(raw.power ?? [])] };
  if (cost.energy === 0 && cost.power.length === 0) {
    return undefined;
  }
  const pool = state.runePools[playerId];
  if (!pool || pool.energy < cost.energy) {
    return undefined;
  }
  return planPipPayment(powerTally(pool), cost.power) === undefined ? undefined : cost;
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
    // rule 811.6 — played from facedown, the card has [Reaction] for audiences
    // like Mystic Vortex even though its printed timing is [Action].
    { fromHidden: true },
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
      // rule 135.2.e.5.a/b — [A] is payable from any domain; spend pooled [A]
      // first so domain-specific Power stays available for domain-specific pips.
      const key =
        (remaining.rainbow ?? 0) > 0
          ? "rainbow"
          : Object.entries(remaining)
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
    if (!canAffordHide(state, context.params.playerId, context)) {
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
    if (!canAffordHide(state, context.playerId as string, context)) {
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
    deductHideCost(_draft, context.params.playerId, context);

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
 * rule-id: sfd-145-221 / unl-083-219 — a `swap-might` / `swap-locations` effect
 * names TWO caster-chosen targets through `target1`/`target2` (`playSpell`
 * enumerates one variant per legal pair). Returns the two descriptors as picker
 * slots so the reveal path can ask for them one at a time.
 */
function pairEffectSlots(effect: unknown): readonly unknown[] | undefined {
  const e = effect as { type?: string; target1?: unknown; target2?: unknown } | undefined;
  if (e?.type !== "swap-might" && e?.type !== "swap-locations") {
    return undefined;
  }
  const { target1, target2 } = e;
  if (typeof target1 !== "object" || target1 === null) {
    return undefined;
  }
  if (typeof target2 !== "object" || target2 === null) {
    return undefined;
  }
  return [target1, target2];
}

/**
 * rule 811.1.d.2 (rule-id: unl-083-219) — a card played from Hidden chooses its
 * objects at the battlefield it was facedown at, but a pair that must stand at
 * DIFFERENT locations ("Choose a unit you control and another unit you control
 * at a different location") could never meet that for both members. The
 * exception applies: exactly one of the two must be at the facedown
 * battlefield and the other is chosen freely. Returns the legal pairs, each
 * with the unit at the facedown battlefield first, or undefined for every other
 * effect shape.
 */
function hiddenDifferentLocationPairs(
  state: RiftboundGameState,
  cardId: string,
  playerId: string,
  battlefieldId: string | undefined,
  context: HiddenTargetContext,
): string[][] | undefined {
  if (battlefieldId === undefined) {
    return undefined;
  }
  const registry = getGlobalCardRegistry();
  const effect = (registry.getAbilities(cardId) ?? []).find((a) => a.type === "spell")?.effect as
    | SpellEffectTargetShape
    | undefined;
  if (!pairEffectRoles(effect)?.differentZones) {
    return undefined;
  }
  const bfZone = getBattlefieldZoneId(battlefieldId);
  const pairs =
    enumerateTargetPairs(effect, {
      cards: context.cards,
      choosing: true,
      draft: state,
      playerId,
      sourceCardId: cardId,
      sourceZone: bfZone,
      zones: context.zones,
    } as Parameters<typeof enumerateTargetPairs>[1]) ?? [];
  const out: string[][] = [];
  for (const [a, b] of pairs) {
    const aHere = context.zones.getCardZone(a as CoreCardId) === bfZone;
    const bHere = context.zones.getCardZone(b as CoreCardId) === bfZone;
    if (!aHere && !bHere) {
      continue;
    }
    out.push(aHere ? [a, b] : [b, a]);
  }
  return out;
}

/** Card/zone accessors every hidden-play helper needs. */
type HiddenTargetContext = {
  cards: {
    getCardController?: (id: CoreCardId) => string | undefined;
    getCardMeta?: (id: CoreCardId) => unknown;
    getCardOwner: (id: CoreCardId) => string | undefined;
  };
  zones: {
    getCardZone: (id: CoreCardId) => string | undefined;
    getCardsInZone: (zoneId: CoreZoneId, playerId?: CorePlayerId) => readonly CoreCardId[];
  };
};

/**
 * rule 355.13 / 355.15 with 811.1.d.2 — the "any number of …" / "up to N …"
 * choice a card played from Hidden makes as it is PLAYED, plus the candidates
 * available at its facedown battlefield.
 *
 * `pool` is every candidate there (the 811.1.d playability gate reads it);
 * `choosable` drops candidates barred by an aggregate cap such as Fox-Fire's
 * `totalMight` (ogn-256-298), and `maxSize` is how many may be named at once.
 * Undefined for every other shape — single-object descriptors keep the
 * `lockRevealedSpellTarget` prompt path.
 */
function hiddenMultiPickChoice(
  state: RiftboundGameState,
  cardId: string,
  playerId: string,
  battlefieldId: string | undefined,
  context: HiddenTargetContext,
): { pool: string[]; choosable: string[]; maxSize: number; totalMightCap?: number } | undefined {
  if (battlefieldId === undefined) {
    return undefined;
  }
  const registry = getGlobalCardRegistry();
  if (registry.get(cardId)?.cardType !== "spell") {
    return undefined;
  }
  const effect = (registry.getAbilities(cardId) ?? []).find((a) => a.type === "spell")?.effect as
    | SpellEffectTargetShape
    | undefined;
  // rule 811.1.d.2.a (ven-034-166) — a spell that PULLS its object into the
  // facedown battlefield chooses that object freely, so it is not this shape.
  if (!effect || hiddenChoiceIsPulledIn(effect)) {
    return undefined;
  }
  const raw =
    ((effect as { target?: unknown }).target as Record<string, unknown> | undefined) ??
    (findSequenceLeadTarget(effect) as Record<string, unknown> | undefined);
  if (typeof raw !== "object" || raw === null || typeof raw.type !== "string") {
    return undefined;
  }
  if (raw.type === "self" || raw.type === "player" || raw.type === "battlefield" || raw.type === "trigger-source") {
    return undefined;
  }
  const qty = raw.quantity;
  const upTo =
    typeof qty === "object" &&
    qty !== null &&
    (qty as { upTo?: number }).upTo !== undefined &&
    (qty as { atLeast?: number }).atLeast === undefined
      ? ((qty as { upTo: number }).upTo as number)
      : undefined;
  if (qty !== "any" && upTo === undefined) {
    return undefined;
  }
  const bfZone = getBattlefieldZoneId(battlefieldId);
  // rule 811.1.d.2 — candidates come only from the facedown battlefield.
  const pool = (
    resolveTarget({ ...(raw as object), quantity: "all" } as never, {
      cards: context.cards,
      choosing: true,
      draft: state,
      playerId,
      sourceCardId: cardId,
      sourceZone: bfZone,
      zones: context.zones,
    } as Parameters<typeof resolveTarget>[1]) as string[]
  ).filter((id) => context.zones.getCardZone(id as CoreCardId) === bfZone);
  const totalMightCap = (raw as { totalMight?: { lte?: number } }).totalMight?.lte;
  const mightOf = (id: string): number =>
    getCardEffectiveMight(id, (c) => context.cards.getCardMeta?.(c) as never);
  const choosable =
    totalMightCap === undefined ? pool : pool.filter((id) => mightOf(id) <= totalMightCap);
  return {
    choosable,
    maxSize: upTo ?? choosable.length,
    pool,
    ...(totalMightCap === undefined ? {} : { totalMightCap }),
  };
}

/**
 * rule 355.15 / 811.1.d.2 — are these the Game Objects a play from Hidden may
 * lock in? Distinct, all candidates at the facedown battlefield, within the
 * descriptor's count and aggregate caps. The empty list is always an answer
 * (rule 355.13); a card with no multi-pick descriptor accepts no list at all.
 */
function suppliedHiddenTargetsAreLegal(
  state: RiftboundGameState,
  cardId: string,
  playerId: string,
  battlefieldId: string | undefined,
  supplied: readonly string[],
  context: HiddenTargetContext,
): boolean {
  // rule 811.1.d.2 (unl-083-219) — a "different location" pair is named as one
  // set of two; accept exactly the pairs the play offers.
  const pairs = hiddenDifferentLocationPairs(state, cardId, playerId, battlefieldId, context);
  if (pairs) {
    return pairs.some(
      (p) => p.length === supplied.length && p.every((id) => supplied.includes(id)),
    );
  }
  const multi = hiddenMultiPickChoice(state, cardId, playerId, battlefieldId, context);
  if (!multi) {
    return false;
  }
  if (new Set(supplied).size !== supplied.length || supplied.length > multi.maxSize) {
    return false;
  }
  if (!supplied.every((id) => multi.choosable.includes(id))) {
    return false;
  }
  if (multi.totalMightCap !== undefined) {
    const total = supplied.reduce(
      (sum, id) => sum + getCardEffectiveMight(id, (c) => context.cards.getCardMeta?.(c) as never),
      0,
    );
    if (total > multi.totalMightCap) {
      return false;
    }
  }
  return true;
}

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
  // rule 811.1.d.2 (rule-id: unl-083-219) — a pair that must stand at DIFFERENT
  // locations only needs ONE member at the facedown battlefield.
  const crossLocationPairs = hiddenDifferentLocationPairs(
    state,
    cardId,
    playerId,
    battlefieldId,
    context,
  );
  if (crossLocationPairs) {
    return crossLocationPairs.length > 0;
  }
  // rule-id: sfd-145-221 — rule 811.1.d: a two-target effect ("Swap the Might of
  // TWO units at the same battlefield") needs two DISTINCT candidates at the
  // facedown battlefield; each descriptor being individually satisfiable is not
  // enough, so a lone unit there makes the card unplayable from Hidden.
  const pairSlots = pairEffectSlots(effect);
  if (pairSlots) {
    const pools = pairSlots.map((slot) =>
      (
        resolveTarget({ ...(slot as object), quantity: "all" } as never, {
          cards: context.cards,
          choosing: true,
          draft: state,
          playerId,
          sameZone: bfZone,
          sourceCardId: cardId,
          sourceZone: bfZone,
          zones: context.zones,
        } as Parameters<typeof resolveTarget>[1]) as string[]
      ).filter((id) => context.zones.getCardZone(id as CoreCardId) === bfZone),
    );
    const hasPair = pools[0]?.some((a) => pools[1]?.some((b) => b !== a)) ?? false;
    if (!hasPair) {
      return false;
    }
  }
  // rule 811.1.d — a card played from Hidden must be able to choose its objects
  // at THAT battlefield; 811.1.d overrides 355.13, so an "any number" / "up to N"
  // descriptor that would happily settle for zero anywhere else still needs at
  // least one candidate there (sfd-043-221 Emperor's Divide with no friendly unit
  // left at its battlefield is unplayable from face down, though the same card
  // from hand may still choose zero).
  // `casterChosenTarget` deliberately skips the multi-pick shapes, so the
  // descriptor is read straight off the effect by `hiddenMultiPickChoice`.
  const multi = hiddenMultiPickChoice(state, cardId, playerId, battlefieldId, context);
  if (multi && multi.pool.length === 0) {
    return false;
  }
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
    // rule 811.1.d.2.a (ven-034-166) — unless the spell PULLS its chosen object
    // into that battlefield: then the battlefield is the destination and the
    // object is chosen freely.
    ...(hiddenChoiceIsPulledIn(effect) ? {} : { hiddenZone: bfZone }),
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
 * rule 355.5 / 811.1.b (rule-id: ogn-213-298) — playing a card from Hidden
 * follows the normal play process, so its targets are chosen when it is
 * PLAYED, before anyone receives Priority, not when the chain item resolves.
 * The pick is locked onto the chain item (`bindToChainItemId`), so a response
 * that moves the chosen unit away mistargets the spell (rule 359.3.e.5).
 * Candidates are restricted to the facedown battlefield (rule 811.1.d.2).
 * With fewer than two options nothing is asked and resolution keeps its
 * existing behaviour, mirroring `lockTriggerTargets`.
 */
function lockRevealedSpellTarget(
  draft: RiftboundGameState,
  playerId: string,
  cardId: string,
  battlefieldId: string | undefined,
  // biome-ignore lint/suspicious/noExplicitAny: engine move context is framework-typed
  ctx: { cards: any; zones: any },
): void {
  if (draft.pendingChoice || battlefieldId === undefined) {
    return;
  }
  const items = draft.interaction?.chain?.items as
    | ({ readonly id: string } & Record<string, unknown>)[]
    | undefined;
  const item = items?.[items.length - 1];
  if (!item || item.cardId !== cardId || item.targets !== undefined) {
    return;
  }
  // rule-id: sfd-145-221 (rule 355.5 / 811.1.d.2) — a `swap-might` /
  // `swap-locations` names its two objects through target1/target2 rather than
  // a sequence, so `casterChosenTarget` sees nothing and the resolver would
  // silently auto-pair. Ask for the pair the same way as a two-slot sequence.
  const pairSlots = pairEffectSlots(item.effect);
  if (pairSlots && pairSlots.every((s) => isSinglePickSlot(s))) {
    beginRevealPairLock(
      draft,
      { battlefieldId, cardId, itemId: item.id, playerId, slots: pairSlots },
      ctx,
    );
    return;
  }
  // rule-id: ogn-220-298 (rule 355.5 / 811.1.b) — "Stun a friendly unit and an
  // enemy unit at the same battlefield": a sequence naming TWO caster-chosen
  // slots is asked for one prompt per slot and locked as targets [a, b],
  // exactly like the `playSpell` pair enumeration.
  const slots = collectSequenceTargetSlots(item.effect as SpellEffectTargetShape);
  if (
    findSequenceLeadTarget(item.effect as SpellEffectTargetShape) === undefined &&
    slots !== undefined &&
    slots.length >= 2 &&
    slots.every((s) => isSinglePickSlot(s))
  ) {
    beginRevealSlotLock(
      draft,
      { battlefieldId, cardId, itemId: item.id, playerId, slots },
      ctx,
    );
    return;
  }
  // rule-id: ogn-213-298 — "Kill a unit at a battlefield. Its controller draws
  // 2" is a `sequence`; the lead step carries the caster-chosen target.
  const target =
    casterChosenTarget(item.effect) ??
    casterChosenTarget({
      target: findSequenceLeadTarget(item.effect as SpellEffectTargetShape),
    });
  if (!target) {
    return;
  }
  const bfZone = getBattlefieldZoneId(battlefieldId);
  const options = (
    resolveTarget({ ...target, quantity: "all" }, {
      cards: ctx.cards,
      choosing: true,
      draft,
      playerId,
      sourceCardId: cardId,
      sourceZone: bfZone,
      zones: ctx.zones,
    } as Parameters<typeof resolveTarget>[1]) as string[]
  ).filter(
    (id) =>
      // rule 811.1.d.2.a (ven-034-166) — a spell that PULLS its chosen object
      // into the facedown battlefield chooses that object freely.
      hiddenChoiceIsPulledIn(item.effect as SpellEffectTargetShape) ||
      ctx.zones.getCardZone(id as CoreCardId) === bfZone,
  );
  // rule 809.1.b / 809.1.d — an opponent's [Deflect] object costs extra to
  // CHOOSE, on top of whatever the card cost (a [0] Hidden flip included), so a
  // candidate whose surcharge this caster cannot cover is not offered.
  const { deflectTax, options: affordable } = filterDeflectAffordable(
    draft,
    playerId,
    cardId,
    options,
    ctx,
  );
  if (affordable.length === 0) {
    return;
  }
  // rule 355.5 with rule 402.2 — a lone legal candidate is no decision, but it is
  // still CHOSEN as the card is played: lock it onto the chain item so a response
  // that moves it away mistargets (359.3.e.5) and a later re-choice by a new
  // controller (752.1) starts from a real target instead of nothing.
  if (affordable.length === 1) {
    const idx = items?.findIndex((it) => it.id === item.id) ?? -1;
    if (items && idx >= 0) {
      items[idx] = { ...items[idx], targets: [affordable[0] as string] };
    }
    // rule 809.1.c.1 — the surcharge is owed as the target is chosen.
    chargeDeflectFor(draft, playerId, cardId, affordable, ctx);
    return;
  }
  draft.pendingChoice = {
    bindToChainItemId: item.id,
    effect: item.effect as never,
    options: affordable as never,
    playerId: playerId as never,
    remaining: 1,
    sourceCardId: cardId as never,
    ...(deflectTax ? { deflectTax: true as const } : {}),
    type: "choose-target",
  };
}

/**
 * Reveal and play a hidden card (rule 723.1.c.3).
 *
 * Playing a card from facedown OPENS a chain. For spell cards this
 * means we add a chain item (same as playSpell). For unit/gear cards
 * we move them to the appropriate zone (battlefield / base).
 */
/** rule 355.1 — `costs.paid["accelerate-granted"]` is the canonical spelling of the granted-Accelerate election. */
function expandRevealCosts<P extends { costs?: { paid?: Readonly<Record<string, unknown>> }; paidAdditionalCost?: boolean }>(params: P): P {
  if (!params.costs || params.paidAdditionalCost !== undefined) {
    return params;
  }
  const paid = params.costs.paid ?? {};
  return paid["accelerate-granted"] !== undefined ||
    paid.accelerate !== undefined ||
    paid.pay !== undefined
    ? { ...params, paidAdditionalCost: true }
    : params;
}

export const revealHidden: Defs["revealHidden"] = {
  condition: (state, rawContext) => {
    const context = rawContext.params.costs
      ? { ...rawContext, params: expandRevealCosts(rawContext.params) }
      : rawContext;
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
    // rule 811.1.b (unl-190-219) — revealing a hidden card PLAYS it, so a
    // "can't play spells this turn" restriction blocks a hidden SPELL too.
    if (
      state.cannotPlaySpellsThisTurn?.[context.params.playerId as string] ===
        state.turn.number &&
      getGlobalCardRegistry().getCardType(context.params.cardId as string) === "spell"
    ) {
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
    // rule 811.1.d.1 + 054 (rule-id: sfd-216-221) — revealing PLAYS the card at
    // the battlefield it was hidden at, so a battlefield that forbids unit
    // plays ("Units can't be played here") traps a hidden UNIT facedown for
    // good. A hidden spell there is unaffected.
    if (
      typeof meta.hiddenAt === "string" &&
      battlefieldForbidsUnitPlays(meta.hiddenAt) &&
      getGlobalCardRegistry().getCardType(context.params.cardId as string) === "unit"
    ) {
      return false;
    }
    // rule 811.1.c.3 / 419.1 — revealing a facedown card IS playing it, so a
    // board static that forbids playing it (ven-132-166 Fallen Feline) refuses
    // the flip exactly as it refuses the copy in hand.
    if (
      playIsForbidden(
        { cards: context.cards, draft: state, zones: context.zones },
        context.params.playerId as string,
        context.params.cardId as string,
      )
    ) {
      return false;
    }
    // rule 811.6 / 312.1.a / 338.1 — playing a card from a facedown zone still
    // needs Priority: [Reaction] timing adds Closed States, it does not let a
    // non-Turn-Player act in a Neutral Open State, a non-Focus holder act in a
    // Showdown Open State, nor anyone but the Priority holder act while a chain
    // is open. Exactly the window every other play move uses.
    if (!reactionWindowOpen(state, context.params.playerId as string)) {
      return false;
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
    // rule 355.5 / 355.15 with 811.1.d.2 — objects named as the card is played
    // must be legal choices at its facedown battlefield (never trust the
    // client's list).
    if (
      context.params.targets !== undefined &&
      !suppliedHiddenTargetsAreLegal(
        state,
        context.params.cardId as string,
        context.params.playerId as string,
        meta.hiddenAt,
        context.params.targets as readonly string[],
        context,
      )
    ) {
      return false;
    }
    // rule-id: sfd-029-221 (rule 805.1.a) — the optional Accelerate cost is only
    // payable when a static licenses it and the pool covers it.
    // rule 356.2 (rule-id: unl-028-219) — or the card's OWN optional additional
    // cost, which a flip still offers and still pays.
    if (
      context.params.paidAdditionalCost === true &&
      !grantedAccelerateForReveal(
        state,
        context.params.playerId as string,
        context.params.cardId as string,
        context,
      ) &&
      !ownOptionalPayCostForReveal(
        state,
        context.params.playerId as string,
        context.params.cardId as string,
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
    const results: {
      playerId: string;
      cardId: string;
      targets?: string[];
      paidAdditionalCost?: boolean;
    }[] = [];
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
        // rule 355.5 / 355.13 / 355.15 (rule-id: sfd-043-221) — an "any number
        // of …" / "up to N …" descriptor is chosen as the card is PLAYED, so
        // offer one variant per legal set (the empty set included) instead of
        // deferring the whole choice to a resolution-time pick. Candidates are
        // restricted to the facedown battlefield (811.1.d.2).
        // rule 811.1.d.2 (rule-id: unl-083-219) — a "different location" pair is
        // named as the card is played; offer one variant per legal pair.
        const crossPairs = hiddenDifferentLocationPairs(
          state,
          hid as string,
          playerId,
          meta.hiddenAt,
          context,
        );
        if (crossPairs) {
          for (const pair of crossPairs) {
            results.push({ cardId: hid as string, playerId, targets: [...pair] });
          }
          continue;
        }
        const multi = hiddenMultiPickChoice(state, hid as string, playerId, meta.hiddenAt, context);
        if (multi) {
          for (const subset of enumerateSubsetsUpTo(multi.choosable, multi.maxSize)) {
            if (
              multi.totalMightCap !== undefined &&
              subset.reduce(
                (sum, id) => sum + getCardEffectiveMight(id, (c) => context.cards.getCardMeta?.(c) as never),
                0,
              ) > multi.totalMightCap
            ) {
              continue;
            }
            results.push({ cardId: hid as string, playerId, targets: subset });
          }
          continue;
        }
        results.push({ cardId: hid as string, playerId });
        // rule-id: sfd-029-221 (rule 805.1.a) — offer the granted Accelerate as a
        // second variant so the reveal can enter ready.
        if (grantedAccelerateForReveal(state, playerId, hid as string, context)) {
          results.push({
            cardId: hid as string,
            costs: { alternativeId: "hidden", paid: { "accelerate-granted": true } },
            paidAdditionalCost: true,
            playerId,
          } as (typeof results)[number]);
        }
        // rule 356.2 (rule-id: unl-028-219) — the card's own "You may pay … as an
        // additional cost to play me" is offered on the flip as well.
        if (ownOptionalPayCostForReveal(state, playerId, hid as string)) {
          results.push({
            cardId: hid as string,
            costs: { alternativeId: "hidden", paid: { pay: true } },
            paidAdditionalCost: true,
            playerId,
          } as (typeof results)[number]);
        }
      }
    }
    return results;
  },
  reducer: (draft, rawContext) => {
    const context = rawContext.params.costs
      ? { ...rawContext, params: expandRevealCosts(rawContext.params) }
      : rawContext;
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

    // rule 340.2.a / 347.1 — revealing a facedown card is PLAYING it
    // (811.1.c.3), so during a Showdown it is a Focus action just like a play
    // from hand: Focus passes once it has landed (settled at the tail).
    const preInteraction = draft.interaction;
    const chainLenBeforeFlip = preInteraction?.chain?.items.length ?? 0;
    const wasFocusAction =
      !preInteraction?.chain?.items.length &&
      getActiveShowdown(preInteraction ?? createInteractionState())?.focusPlayer === playerId;

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
      // rule 355.5 / 355.15 — objects named as the card was played ride onto the
      // chain item now and are never re-chosen at resolution; the empty list
      // (rule 355.13) is just as final as a full one.
      const chosenTargets = context.params.targets as readonly string[] | undefined;
      draft.interaction = addToChain(
        interaction,
        {
          cardId,
          controller: playerId,
          effect: spellEffect,
          resolveTo: "trash",
          ...(chosenTargets === undefined ? {} : { targets: [...chosenTargets] }),
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
      // rule 419.4.a / 425.1.b: `play-spell` / `play-card` fire when the play is
      // COMPLETED by resolution (and never for a countered card), so they are
      // emitted once by chain/resolve.ts firePlayedCardTriggers — not here.
      // rule-id: ogn-167-298 — rule 811.1.c.3: revealing a facedown card is
      // playing it "from [Hidden]". rule 419.4.a / 425.1.b — that play is
      // COMPLETED by resolution, so a spell's `play-from-hidden` is emitted by
      // chain/resolve.ts (keyed off the chain item's `fromHiddenAt`) rather
      // than while opponents still hold a reaction window. A facedown card is
      // always facedown AT a battlefield; without one there is nothing to key
      // off, so fall back to firing here.
      if (battlefieldId === undefined) {
        fireTriggers(
          { cardId, cardType: "spell", playerId, type: "play-from-hidden" },
          { cards, counters, draft, zones },
        );
      }
      if (chosenTargets !== undefined) {
        // rule 359.2 — "when you choose me" fires as the play names its objects.
        for (const targetId of chosenTargets) {
          fireTriggers(
            { cardId: targetId, chooserId: playerId, sourceType: "spell", type: "choose" },
            { cards, counters, draft, zones },
          );
        }
        return;
      }
      // rule 355.5 / 811.1.b — targets are chosen as the card is played.
      lockRevealedSpellTarget(draft, playerId, cardId, battlefieldId, { cards, zones });
      return;
    }

    // Unit / gear / equipment: rule 811.1.d.3 — it enters the board at the
    // battlefield it was hidden at, face up, without using the chain. The ONE
    // enter path (`play-pipeline.ts`) applies the "next unit you play"
    // replacement / "I enter ready" statics / a paid granted Accelerate
    // (sfd-029-221), fires the play triggers (with `fromHiddenAt` so their
    // targets stay at that battlefield — 811.1.d.2) and counts the play.
    (draft as { lastPlayTriggerBatch?: string }).lastPlayTriggerBatch = undefined;
    if (cardType === "unit" || cardType === "gear" || cardType === "equipment") {
      let paidAccelerate = false;
      let paidOwnOptional = false;
      if (cardType === "unit" && context.params.paidAdditionalCost === true) {
        const cost = grantedAccelerateForReveal(draft, playerId, cardId, { cards, zones });
        if (cost) {
          payGrantedAccelerate(draft, playerId, cost);
          paidAccelerate = true;
        }
      }
      // rule 356.2 (rule-id: unl-028-219) — the card's own optional additional
      // cost is paid from the pool as the flip plays it, so its
      // "if you paid the additional cost" trigger sees the payment.
      if (!paidAccelerate && context.params.paidAdditionalCost === true) {
        const own = ownOptionalPayCostForReveal(draft, playerId, cardId);
        if (own) {
          payGrantedAccelerate(draft, playerId, own);
          paidOwnOptional = true;
        }
      }
      enterPlayedPermanent(
        { cards, counters, draft, zones },
        {
          cardId,
          entersReady: paidAccelerate,
          entryZone: battlefieldId
            ? (getBattlefieldZoneId(battlefieldId) as string)
            : ((zones.getCardZone(cardId as CoreCardId) as string | undefined) ?? "base"),
          from: battlefieldId ? `facedown-${battlefieldId}` : "facedown",
          paidAdditionalCost: paidAccelerate || paidOwnOptional,
          paidIds: paidAccelerate ? ["accelerate-granted"] : paidOwnOptional ? ["pay"] : [],
          playerId,
          via: "hidden",
          ...(battlefieldId ? { fromHiddenAt: battlefieldId } : {}),
        },
      );
    }

    // rule-id: ogn-167-298 — rule 811.1.c.3: revealing a facedown card is
    // playing it "from [Hidden]" (units, gear and equipment alike).
    // rule 811.1.d.2 — "(here)": carry the facedown battlefield on the event so
    // the trigger's own targets are scoped to it (sfd-139-221).
    const chainLenBeforeHiddenTriggers = draft.interaction?.chain?.items.length ?? 0;
    fireTriggers(
      {
        cardId,
        playerId,
        type: "play-from-hidden",
        ...(cardType ? { cardType } : {}),
        ...(battlefieldId ? { fromHiddenAt: battlefieldId } : {}),
      },
      { cards, counters, draft, zones },
    );
    // rule 383.3.d / 811.1.c.3 — `play-self` / `play-card` (fired as the card
    // entered) and `play-from-hidden` are separate publications of ONE play, so
    // the triggers they raise triggered SIMULTANEOUSLY and their controller may
    // still order them (Evelynn's from-Hidden trigger vs. Star Spring's "when a
    // player plays a unit here"). Only those two windows join: designation and
    // arrival triggers raised in between are their own, later batch (337.1.b).
    stampBatch(draft, chainLenBeforeHiddenTriggers, (draft as { lastPlayTriggerBatch?: string }).lastPlayTriggerBatch);

    // rule 347.1.a/.b — the Focus action of playing this card started a Chain
    // (its own play triggers); when THAT chain closes Focus passes to the next
    // player in Turn Order. 346.1 keeps Focus only for a chain a trigger
    // OPENED on its own, not for one the play itself queued, so release the
    // latch. A permanent flipped from Hidden that queues nothing never uses
    // the Chain (811.1.d.3): there is no chain to close and Focus stays put.
    if (wasFocusAction && draft.interaction?.chain?.items.length) {
      draft.interaction = advanceFocusAfterPlay(
        draft.interaction,
        playerId as string,
        draft.pendingChoice !== undefined && draft.pendingChoice !== null,
      ) as typeof draft.interaction;
    }

    // rule 337.2 / 340.4 (ruling 5ca148dd1d06db74) — a permanent flipped from
    // [Hidden] resolves at once and never occupies the Chain, so it does not
    // consume the round of Priority already under way on the items sitting
    // there: it is a new game action, the passes collected before it are void
    // and the controller of the NEWEST Chain item receives Priority again.
    // Only when the flip queued nothing of its own — otherwise those Pending
    // items are the newest and the finalization sweep seats Priority.
    const chainAfterFlip = draft.interaction?.chain;
    if (
      chainLenBeforeFlip > 0 &&
      chainAfterFlip &&
      chainAfterFlip.items.length === chainLenBeforeFlip &&
      !draft.pendingChoice
    ) {
      const top = chainAfterFlip.items[chainAfterFlip.items.length - 1];
      if (
        top &&
        (chainAfterFlip.activePlayer !== top.controller || chainAfterFlip.passedPlayers.length > 0)
      ) {
        draft.interaction = {
          ...draft.interaction,
          chain: { ...chainAfterFlip, activePlayer: top.controller, passedPlayers: [] },
        } as typeof draft.interaction;
      }
    }
  },
};
