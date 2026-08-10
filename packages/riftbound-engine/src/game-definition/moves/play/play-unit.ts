/**
 * playUnit move (split from cards.ts).
 */

import type {
  CardId as CoreCardId,
  PlayerId as CorePlayerId,
  ZoneId as CoreZoneId,
  GameMoveDefinitions,
} from "@tcg/core";
import type { RiftboundCardMeta, RiftboundGameState, RiftboundMoves } from "../../../types";
import { fireTriggers } from "../../../abilities/trigger-runner";
import { executeEffect } from "../../../abilities/effect-executor";
import { resolveTarget } from "../../../abilities/target-resolver";
import {
  createInteractionState,
  getActiveShowdown,
  getTurnState,
  hasShowdownPermission,
  isLegalTiming,
} from "../../../chain";
import { getGlobalCardRegistry } from "../../../operations/card-lookup";
import { removeFromBoard } from "../../../operations/leave-board";
import { canPlayViaAmbush } from "../../../keywords/keyword-effects";
import { selfPlayIsForbidden } from "../../../abilities/play-restrictions";
import { enterPlayedPermanent } from "./play-pipeline";
import {
  extractBattlefieldId,
  getBattlefieldZoneId,
  isBattlefieldZone,
} from "../../../zones/zone-configs";
import {
  canPlayToOpenBattlefield,
  canPlayToOccupiedEnemyBattlefield,
  canPlayToEnemyOccupiedBattlefield,
  getOccupiedBattlefieldPermission,
  battlefieldMatchesOccupiedPermission,
  battlefieldHasEnemyUnits,
  canPlayToAttackedBattlefield,
  battlefieldIsAttackedBy,
  battlefieldIsOccupiedEnemy,
  battlefieldIsOpen,
  opponentsRestrictedToBase,
  battlefieldForbidsUnitPlay,
  battlefieldRedirectPowerFor,
  playOnlyToConqueredBattlefield,
  getBuffSpendCost,
  getKillAnyNumberCost,
  getOptionalPlayCost,
  optionalPlayCostOffered,
  getSacrificeCostDiscount,
  createMetaAccessor,
  getPotentialRuneEnergy,
  canAffordCard,
  deductCost,
  recordPowerSpent,
  discountOptionalPlayCost,
  getAlternatePlayCost,
  getGrantedAcceleratePlayCost,
  applyPowerWaiversToPips,
  getPlayEnergyDiscountOverflow,
  getPlayPowerDiscountOverflow,
  hasPlayFromTrashGrant,

} from "./cost";
import type { OptionalPlayCost } from "./cost";
import { getSelfTrashPlayCost } from "./self-trash-play";
import {
  collectBoardCards,
  legacyParamsFromSelection,
  paidIdsFromLegacyParams,
  withCostsParam,
} from "./cost-model";
import { computeOptionalAdditionalCostFlexReduction } from "../../../operations/static-cost-reduction";
import type { CostExtras } from "./cost";

type Defs = GameMoveDefinitions<RiftboundGameState, RiftboundMoves, RiftboundCardMeta, unknown>;

/**
 * rule 135.2.e.5.a / 135.2.e.5.b — plan how an optional additional cost's Power
 * pips are paid from the pool: a named-Domain pip prefers its own Domain and
 * falls back to pooled [rainbow] Power, a [rainbow] pip is payable from any
 * Domain. Returns the per-Domain amounts to spend, or undefined when the pool
 * cannot cover the pips.
 */
/**
 * rule 355.2 / 740.2.a (unl-117-219) — may `cardId` be played onto `bfId`
 * because of a `can-play-to-occupied` permission (its own, or one a friendly
 * permanent grants) and does that battlefield's occupancy satisfy it?
 */
function occupiedPermissionAllowsBattlefield(
  state: Parameters<typeof getOccupiedBattlefieldPermission>[0],
  zones: Parameters<typeof getOccupiedBattlefieldPermission>[1],
  getController: Parameters<typeof battlefieldMatchesOccupiedPermission>[1],
  cardId: string,
  playerId: string,
  bfId: string,
): boolean {
  const permission = getOccupiedBattlefieldPermission(state, zones, cardId, playerId);
  return (
    permission !== undefined &&
    battlefieldMatchesOccupiedPermission(zones, getController, bfId, playerId, permission)
  );
}

function planAdditionalCostPips(
  pips: readonly string[],
  have: Partial<Record<string, number>>,
): Record<string, number> | undefined {
  const left: Record<string, number> = {};
  for (const [domain, count] of Object.entries(have)) {
    left[domain] = count ?? 0;
  }
  const spend: Record<string, number> = {};
  const take = (domain: string) => {
    left[domain] = (left[domain] ?? 0) - 1;
    spend[domain] = (spend[domain] ?? 0) + 1;
  };
  let wild = 0;
  for (const pip of pips) {
    if (pip === "rainbow") {
      wild++;
      continue;
    }
    if ((left[pip] ?? 0) > 0) {
      take(pip);
    } else if ((left.rainbow ?? 0) > 0) {
      take("rainbow");
    } else {
      return undefined;
    }
  }
  for (let i = 0; i < wild; i++) {
    const domain = Object.keys(left)
      .filter((d) => (left[d] ?? 0) > 0)
      .sort((a, b) => (left[b] ?? 0) - (left[a] ?? 0))[0];
    if (domain === undefined) {
      return undefined;
    }
    take(domain);
  }
  return spend;
}

/**
 * rule 805.2 / 355.1.a (sfd-029-221 Rek'Sai, Breacher) — Accelerate granted by a
 * board static to "units played from anywhere other than a player's hand" is an
 * optional additional cost exactly like a printed one, so every cost path reads
 * the printed optional cost OR, for a non-hand play, the granted Accelerate.
 * A printed optional cost always wins (a card never gets two Accelerates).
 */
function effectiveOptionalPlayCost(
  state: RiftboundGameState,
  playerId: string,
  cardId: string,
  board?: CostExtras["board"],
): OptionalPlayCost | undefined {
  const printed = getOptionalPlayCost(cardId);
  if (printed || !board) {
    return printed;
  }
  const zone = board.zones.getCardZone(cardId as CoreCardId) as string | undefined;
  if (zone === "hand" || zone === undefined) {
    return printed;
  }
  const granted = getGrantedAcceleratePlayCost(cardId, playerId, collectBoardCards(state, board), false);
  return granted ? { cost: { energy: granted.energy, power: granted.power }, kind: "accelerate" } : undefined;
}

/**
 * rule-id: unl-178-219 (rule 560) — resolve a unit's payable optional cost
 * (Accelerate / "you may pay" / "you may spend N XP") into the net rune-cost
 * delta and XP to spend. Returns undefined when the card has no such cost or
 * the player lacks the XP; an "I cost [N] less" rider nets against the extra
 * energy (so `energy` may be negative).
 */
function resolvePayableOptionalCost(
  state: RiftboundGameState,
  playerId: string,
  cardId: string,
  board?: CostExtras["board"],
):
  | { kind: "accelerate" | "pay"; energy: number; power: readonly string[]; xp: number }
  | undefined {
  const optional = effectiveOptionalPlayCost(state, playerId, cardId, board);
  if (optional?.kind !== "accelerate" && optional?.kind !== "pay") {
    return undefined;
  }
  // rule 364.3.a (unl-122-219) — "if you've played a spell this turn, you may
  // pay …": with the gate unmet the option is not even on the menu.
  if (!optionalPlayCostOffered(optional, state, playerId, cardId)) {
    return undefined;
  }
  const xp = optional.cost?.xp ?? 0;
  if (xp > 0 && (state.players[playerId]?.xp ?? 0) < xp) {
    return undefined;
  }
  // The discount rider is only honoured on the XP path (the reducer spends XP
  // before charging runes); rune-paid extras with a rider are not yet netted.
  const discount = xp > 0 ? (optional.energyDiscount ?? 0) : 0;
  // rule 356.4.c (sfd-149-221): friendly "optional additional costs you pay
  // cost [1] or [rainbow] less" statics shave this cost before it is paid.
  const discounted = discountOptionalPlayCost(
    state,
    playerId,
    { energy: optional.cost?.energy ?? 0, power: optional.cost?.power ?? [] },
    board,
  );
  return {
    energy: (discounted?.energy ?? 0) - discount,
    kind: optional.kind,
    power: discounted?.power ?? [],
    xp,
  };
}

/**
 * rule 356.4.c.1 (sfd-149-221 Ezreal, Prodigy) — every way the payer may apply
 * `flex` "[1] or [rainbow] less" reductions to one optional additional cost.
 * The choice is the PAYER's, so each distinct outcome is offered as its own
 * play variant; `applyFlexibleOptionalCostReduction` only picks the default.
 * Ordered energy-shaved first, deduplicated by shape.
 */
function flexibleOptionalCostVariants(
  cost: { energy?: number; power?: readonly string[] },
  flex: number,
): { energy: number; power: readonly string[] }[] {
  const start = { energy: cost.energy ?? 0, power: [...(cost.power ?? [])] };
  let frontier: { energy: number; power: string[] }[] = [start];
  for (let i = 0; i < flex; i++) {
    const next = new Map<string, { energy: number; power: string[] }>();
    for (const state of frontier) {
      if (state.energy === 0 && state.power.length === 0) {
        next.set(JSON.stringify(state), state);
        continue;
      }
      if (state.energy > 0) {
        const v = { energy: state.energy - 1, power: [...state.power] };
        next.set(JSON.stringify(v), v);
      }
      for (let j = 0; j < state.power.length; j++) {
        const v = { energy: state.energy, power: state.power.filter((_, k) => k !== j) };
        next.set(JSON.stringify(v), v);
      }
    }
    frontier = [...next.values()];
  }
  const seen = new Map<string, { energy: number; power: readonly string[] }>();
  for (const v of frontier) {
    seen.set(JSON.stringify(v), v);
  }
  return [...seen.values()];
}

/**
 * rule 356.4.c.1 (sfd-149-221 Ezreal, Prodigy) — every shape the payer may pay
 * this unit's optional additional cost in. Without a friendly "[1] or
 * [rainbow] less" static there is exactly one (the printed cost); with one the
 * PAYER, not the engine, decides which half each reduction shaves, so each
 * distinct discounted cost is offered as its own play variant. The engine's
 * default (`resolvePayableOptionalCost`) stays first.
 */
function payableOptionalCostVariants(
  state: RiftboundGameState,
  playerId: string,
  cardId: string,
  board?: CostExtras["board"],
): { kind: "accelerate" | "pay"; energy: number; power: readonly string[]; xp: number }[] {
  const base = resolvePayableOptionalCost(state, playerId, cardId, board);
  if (!base) {
    return [];
  }
  const optional = effectiveOptionalPlayCost(state, playerId, cardId, board);
  // The XP path nets its own rider discount — leave it to the default.
  if (!board || base.xp > 0 || (optional?.kind !== "accelerate" && optional?.kind !== "pay")) {
    return [base];
  }
  const flex = computeOptionalAdditionalCostFlexReduction({ draft: state, ...board }, playerId);
  if (flex <= 0) {
    return [base];
  }
  const printed = { energy: optional.cost?.energy ?? 0, power: optional.cost?.power ?? [] };
  const out = [base];
  for (const variant of flexibleOptionalCostVariants(printed, flex)) {
    if (variant.energy === base.energy && variant.power.length === base.power.length && variant.power.every((d, i) => d === base.power[i])) {
      continue;
    }
    out.push({ ...base, energy: variant.energy, power: variant.power });
  }
  return out;
}

/** rule 356.4.c.1 — do two optional-cost shapes name the same payment? */
function sameOptionalCostSpec(
  a: { energy?: number; power?: readonly string[] } | undefined,
  b: { energy?: number; power?: readonly string[] } | undefined,
): boolean {
  const ap = a?.power ?? [];
  const bp = b?.power ?? [];
  return (
    (a?.energy ?? 0) === (b?.energy ?? 0) &&
    ap.length === bp.length &&
    [...ap].sort().every((d, i) => d === [...bp].sort()[i])
  );
}

/**
 * rule 813.1.c.1 — [Reaction] is a timing permission only: a unit carrying it
 * may be played in any Closed state by the player who holds PRIORITY on the
 * chain (not just the Focus holder). Legal destinations are unchanged
 * (rule 813.3.a / 355.2.a: base or a battlefield that player controls).
 */
function holdsChainPriority(state: RiftboundGameState, playerId: string): boolean {
  const chain = (state.interaction ?? createInteractionState()).chain;
  return chain?.active === true && chain.activePlayer === playerId;
}

/**
 * rule 813.1.c / rule 807: [Reaction] means "play any time". The unit's
 * controller may play it whenever they may act at all:
 *  - a Closed state (chain on the stack) → only the priority holder;
 *  - a Showdown Open state → only the Focus holder (rule 347);
 *  - a Neutral Open state → only the turn player (rule 316.5.b: nobody else
 *    holds priority there, so [Reaction] opens no window).
 */
/**
 * rule 347 / 355.2 (unl-120-219, ruling 581f4d14f9876f8a) — "I can be played to a
 * battlefield where there are enemy units" rides on Ambush's Reaction timing, so
 * in a plain chain window ANY battlefield holding enemy units is open (it need not
 * already be contested). A Showdown narrows every action to its own battlefield,
 * so while one is running only that battlefield qualifies (ven-179-166).
 */
function ambushEnemyBattlefieldOpen(state: RiftboundGameState, bfId: string | undefined): boolean {
  const showdown = getActiveShowdown(state.interaction ?? createInteractionState());
  return showdown?.active !== true || showdown.battlefieldId === bfId;
}

function reactionWindowOpen(state: RiftboundGameState, playerId: string): boolean {
  if (holdsChainPriority(state, playerId)) {
    return true;
  }
  const interaction = state.interaction ?? createInteractionState();
  const turnState = getTurnState(interaction);
  if (turnState === "neutral-closed" || turnState === "showdown-closed") {
    // A chain exists and this player does not hold priority.
    return false;
  }
  if (turnState === "neutral-open") {
    // rule 316.5.b: in a Neutral Open State only the turn player may take a
    // Discretionary Action. [Reaction] lifts the timing class (813.1.c.1), not
    // the priority rule — it is no permission to act on the opponent's turn.
    return state.turn.activePlayer === playerId;
  }
  return hasShowdownPermission(interaction, playerId);
}

/** rule 813.1: the unit prints [Reaction] (timing class) or carries it as a keyword. */
function unitHasReaction(cardId: string): boolean {
  const registry = getGlobalCardRegistry();
  return registry.getSpellTiming(cardId) === "reaction" || registry.hasKeyword(cardId, "Reaction");
}

/**
 * rule 340.2.a / 347.1 — taking a Focus action in a Showdown passes Focus to
 * the next Relevant Player once that action finishes. Unlike a pass, the
 * passed-players list is cleared (rule 346), matching what happens when a
 * chain empties.
 */
function advanceFocusAfterAction(
  state: RiftboundGameState["interaction"],
): RiftboundGameState["interaction"] {
  const showdown = getActiveShowdown(state);
  if (!showdown) {
    return state;
  }
  const idx = showdown.relevantPlayers.indexOf(showdown.focusPlayer);
  if (idx < 0) {
    return state;
  }
  const stack = [...state.showdownStack];
  stack[stack.length - 1] = {
    ...showdown,
    focusPlayer: showdown.relevantPlayers[(idx + 1) % showdown.relevantPlayers.length],
    passedPlayers: [],
  };
  return { ...state, showdownStack: stack };
}

type BoardCards = { getCardMeta?: (cardId: CoreCardId) => unknown };
type BoardZones = {
  getCardsInZone: (zoneId: CoreZoneId, playerId: CorePlayerId) => readonly CoreCardId[];
};

/**
 * rule-id: ogn-150-298 (rule 702.2.b) — friendly units on the board whose buff
 * could be spent as an additional cost, in board order (base first).
 */
function friendlyBuffedUnits(
  state: RiftboundGameState,
  zones: BoardZones,
  cards: BoardCards,
  playerId: string,
): string[] {
  const zoneIds = ["base", ...Object.keys(state.battlefields ?? {}).map(getBattlefieldZoneId)];
  const out: string[] = [];
  for (const zoneId of zoneIds) {
    for (const id of zones.getCardsInZone(zoneId as CoreZoneId, playerId as CorePlayerId)) {
      const meta = cards.getCardMeta?.(id as CoreCardId) as { buffed?: boolean } | undefined;
      if (meta?.buffed === true) {
        out.push(id as string);
      }
    }
  }
  return out;
}

/**
 * rule 356.2 — the destinations already enumerated for a card's free play.
 * An additional cost is a cost of playing the card, not of playing it to base,
 * so each paid variant must be offered at every one of these locations.
 */
function enumeratedLocations(
  results: readonly { readonly cardId?: string; readonly location?: string }[],
  cardId: string,
): string[] {
  const seen = new Set<string>();
  for (const r of results) {
    if (r.cardId === cardId && typeof r.location === "string") {
      seen.add(r.location);
    }
  }
  return seen.size > 0 ? [...seen] : ["base"];
}

/**
 * rule-id: ogn-231-298 (rule 356.2.b) — friendly units on the board that could
 * be killed to pay a "kill any number of friendly units" additional cost, in
 * board order (base first). The card being played is never among them (it is
 * still in hand).
 */
function friendlyKillableUnits(
  state: RiftboundGameState,
  zones: BoardZones,
  playerId: string,
): string[] {
  const zoneIds = ["base", ...Object.keys(state.battlefields ?? {}).map(getBattlefieldZoneId)];
  const out: string[] = [];
  for (const zoneId of zoneIds) {
    for (const id of zones.getCardsInZone(zoneId as CoreZoneId, playerId as CorePlayerId)) {
      if (getGlobalCardRegistry().getCardType(id as string) === "unit") {
        out.push(id as string);
      }
    }
  }
  return out;
}

/**
 * rule-id: sfd-079-221 (rule 356.2.b) — does this unit print "you may exhaust
 * your legend as an additional cost to play me"?
 */
function hasLegendExhaustCost(cardId: string): boolean {
  const optional = getOptionalPlayCost(cardId);
  return (
    optional?.kind === "exhaust" &&
    (optional.exhaust as { type?: string } | undefined)?.type === "legend"
  );
}

/**
 * rule 414.4 (sfd-079-221) — the legend can only be exhausted to pay a cost
 * while it is ready; an already-exhausted legend means the option is off.
 */
function readyLegendId(
  zones: BoardZones,
  counters: { getFlag: (cardId: CoreCardId, flag: string) => boolean | undefined },
  playerId: string,
): string | undefined {
  for (const id of zones.getCardsInZone("legendZone" as CoreZoneId, playerId as CorePlayerId)) {
    if (counters.getFlag(id as CoreCardId, "exhausted") !== true) {
      return id as string;
    }
  }
  return undefined;
}

/**
 * Friendly gear (including attached Equipment) on the board — rule 356.2.a.1
 * payment pool. "Friendly" is CONTROL, not ownership, so scan every seat's
 * board zones and filter by controller.
 */
function friendlyBoardGear(
  state: RiftboundGameState,
  zones: BoardZones,
  cards: {
    getCardOwner: (id: CoreCardId) => unknown;
    getCardController?: (id: CoreCardId) => unknown;
  },
  playerId: string,
): string[] {
  const zoneIds = ["base", ...Object.keys(state.battlefields ?? {}).map(getBattlefieldZoneId)];
  const out: string[] = [];
  for (const zoneId of zoneIds) {
    for (const seat of Object.keys(state.runePools ?? {})) {
      for (const id of zones.getCardsInZone(zoneId as CoreZoneId, seat as CorePlayerId)) {
        const type = getGlobalCardRegistry().getCardType(id as string);
        if (type !== "gear" && type !== "equipment") {
          continue;
        }
        const controller =
          (cards.getCardController?.(id as CoreCardId) as string | undefined) ??
          (cards.getCardOwner(id as CoreCardId) as string | undefined);
        if (controller === playerId && !out.includes(id as string)) {
          out.push(id as string);
        }
      }
    }
  }
  return out;
}

/** Non-empty subsets of `ids`, smallest first. Capped so enumeration stays bounded. */
function buffSpendSubsets(ids: readonly string[]): string[][] {
  if (ids.length > 5) {
    // Too many buffed units to offer every combination: fall back to prefixes.
    return ids.map((_, i) => ids.slice(0, i + 1));
  }
  const subsets: string[][] = [];
  for (let mask = 1; mask < 1 << ids.length; mask++) {
    subsets.push(ids.filter((_, i) => (mask & (1 << i)) !== 0));
  }
  subsets.sort((a, b) => a.length - b.length);
  return subsets;
}

/**
 * rule 356.2 (ven-157-166) — the extra pips a destination battlefield charges
 * for THIS play, or undefined when nothing extra is due. The additional cost is
 * what buys the location, so it is charged whenever the destination would not
 * otherwise be a legal one for the player (355.2.a: their own battlefield is);
 * a controller electing the paid variant explicitly pays it too.
 */
function chargedRedirectPower(
  state: RiftboundGameState,
  playerId: string,
  cardId: string,
  location: string | undefined,
  paidAdditionalCost: boolean,
): readonly string[] | undefined {
  if (!location || !isBattlefieldZone(location)) {
    return undefined;
  }
  const bfId = extractBattlefieldId(location);
  if (!bfId) {
    return undefined;
  }
  const pips = battlefieldRedirectPowerFor(bfId, cardId);
  if (!pips) {
    return undefined;
  }
  const controlsIt = state.battlefields?.[bfId]?.controller === playerId;
  return controlsIt && !paidAdditionalCost ? undefined : pips;
}

/**
 * Play a unit to Base (rule 554)
 */
export const playUnit: Defs["playUnit"] = {
  condition: (state, rawContext) => {
    // rule 355.1 — a `costs` selection is the canonical cost param; expand it
    // onto the legacy per-kind params the body below still reads.
    const context = rawContext.params.costs
      ? { ...rawContext, params: legacyParamsFromSelection(rawContext.params.cardId as string, rawContext.params) }
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

    const zone = context.zones.getCardZone(context.params.cardId as CoreCardId);
    if (
      zone !== "hand" &&
      // rule 419.1 (rule-id: ven-022-166) — "You may play cards from your
      // trash" makes the trash a legal play-from zone for its controller.
      !(
        zone === "trash" &&
        (hasPlayFromTrashGrant(state, context.zones, context.params.playerId as string) ||
          // rule 812 / 366.1 (unl-025-219) — the card's own Legion permission
          // makes ITS trash a legal play-from zone for its owner.
          getSelfTrashPlayCost(
            state,
            context.params.playerId as string,
            context.params.cardId as string,
          ) !== undefined)
      )
    ) {
      return false;
    }

    // Rule 103 / 555: only the card's owner may play it.
    const owner = context.cards.getCardOwner(context.params.cardId as CoreCardId);
    if (owner !== context.params.playerId) {
      return false;
    }

    // rule 419.1 (ven-029-166): the card's own text may forbid playing it this
    // early in its controller's game.
    if (
      selfPlayIsForbidden(state, context.params.playerId as string, context.params.cardId as string)
    ) {
      return false;
    }

    // Rule 577.3.c (Ambush): a unit with Ambush may be played to a
    // Battlefield where the player has friendly units, as a Reaction.
    // Otherwise the unit must be played on its controller's turn during
    // The main phase to the player's base.
    const location = context.params.location as string | undefined;
    const targetIsBattlefield = Boolean(location) && isBattlefieldZone(location);
    const registry = getGlobalCardRegistry();
    const hasAmbush = registry.hasKeyword(context.params.cardId, "Ambush");

    const targetBfId = targetIsBattlefield ? extractBattlefieldId(location ?? "") : null;
    const targetBf = targetBfId ? state.battlefields?.[targetBfId] : undefined;
    // Rule 355.2.a: a Battlefield the controller controls is a default
    // valid play location for any unit at standard main-phase timing.
    const targetIsControlledBf =
      Boolean(targetBf) && targetBf?.controller === (context.params.playerId as string);
    const standardTimingOk =
      state.turn.activePlayer === context.params.playerId &&
      state.turn.phase === "main" &&
      getTurnState(state.interaction ?? createInteractionState()) === "neutral-open";
    // rule 813.1.c.1 / 813.1.c: a [Reaction] unit may also be played in any
    // window where its controller may act — priority on a chain, Focus in a
    // showdown, or a Neutral Open state on either player's turn.
    const reactionTimingOk =
      unitHasReaction(context.params.cardId as string) &&
      reactionWindowOpen(state, context.params.playerId as string);

    // rule 355.2 (sfd-216-221): the destination battlefield itself may forbid
    // unit plays ("Units can't be played here") — no permission overrides it.
    if (targetIsBattlefield && targetBfId && battlefieldForbidsUnitPlay(targetBfId)) {
      return false;
    }

    // rule 355.2 (ogn-070-298): an enemy static may confine this player's
    // units to their own base — every battlefield destination is illegal.
    if (
      targetIsBattlefield &&
      opponentsRestrictedToBase(state, context.zones, context.params.playerId as string)
    ) {
      return false;
    }

    // Rule sfd-015-221: "Play me only to a battlefield you conquered this
    // turn" — base and any other battlefield are illegal destinations.
    if (playOnlyToConqueredBattlefield(context.params.cardId as string)) {
      const conquered = state.conqueredThisTurn?.[context.params.playerId as string] ?? [];
      if (!targetBfId || !standardTimingOk || !conquered.includes(targetBfId)) {
        return false;
      }
    } else if (targetIsBattlefield && targetIsControlledBf && (standardTimingOk || reactionTimingOk)) {
      // Rule 355.2.a: controlled battlefield — legal for any unit.
    } else if (
      targetIsBattlefield &&
      Boolean(targetBfId) &&
      (standardTimingOk || reactionTimingOk) &&
      canPlayToAttackedBattlefield(context.params.cardId as string) &&
      battlefieldIsAttackedBy(state, targetBfId as string, context.params.playerId as string) &&
      // rule 464.2.c: Attacker/Defender designations exist only once COMBAT
      // opens (an opposing unit is present). A non-combat showdown — moving
      // onto an empty battlefield — has no Attacker, so nobody is attacking it.
      battlefieldHasEnemyUnits(
        context.zones,
        (id) =>
          (context.cards.getCardController?.(id) as string | undefined) ??
          (context.cards.getCardOwner(id) as string | undefined),
        targetBfId as string,
        context.params.playerId as string,
      )
    ) {
      // rule 355.2 (sfd-025-221): "I can be played to a battlefield you're
      // attacking" — the contested battlefield this player moved onto.
    } else if (
      targetIsBattlefield &&
      targetBf &&
      Boolean(targetBfId) &&
      // rule 170.11.c: open = uncontrolled AND unoccupied
      battlefieldIsOpen(state, context.zones, targetBfId as string) &&
      standardTimingOk &&
      canPlayToOpenBattlefield(
        state,
        context.zones,
        context.params.cardId as string,
        context.params.playerId as string,
      )
    ) {
      // Rule ogn-174-298 / ogn-193-298: static play-restriction ("You may
      // play me to an open battlefield"), or a friendly board unit granting
      // "Friendly units may be played to open battlefields", lets a unit be
      // played to an uncontrolled battlefield at standard main-phase timing.
    } else if (
      targetIsBattlefield &&
      Boolean(targetBfId) &&
      standardTimingOk &&
      canPlayToOccupiedEnemyBattlefield(context.params.cardId as string) &&
      battlefieldIsOccupiedEnemy(
        state,
        context.zones,
        targetBfId as string,
        context.params.playerId as string,
      )
    ) {
      // rule 355.2.b (ogn-161-298): "You may play me to an occupied enemy
      // battlefield" — the arrival contests it and stages combat (323.13).
    } else if (
      targetIsBattlefield &&
      Boolean(targetBfId) &&
      // rule 822.1.d (unl-120-219): on a card that also has Ambush this
      // permission extends Ambush itself, so it carries Ambush's Reaction
      // timing into any battlefield holding enemy units — contested or not
      // (ruling 581f4d14f9876f8a) — but never outside a running Showdown's own
      // battlefield. rule 310.1.a still applies: the player must be in a window
      // they may act in, which `reactionWindowOpen` enforces.
      (standardTimingOk ||
        reactionTimingOk ||
        (hasAmbush &&
          reactionWindowOpen(state, context.params.playerId as string) &&
          ambushEnemyBattlefieldOpen(state, targetBfId as string))) &&
      canPlayToEnemyOccupiedBattlefield(context.params.cardId as string) &&
      battlefieldHasEnemyUnits(
        context.zones,
        (id) =>
          (context.cards.getCardController?.(id) as string | undefined) ??
          (context.cards.getCardOwner(id) as string | undefined),
        targetBfId as string,
        context.params.playerId as string,
      )
    ) {
      // rule 355.2 (unl-120-219): "I can be played to a battlefield where there
      // are enemy units (even if you don't have units there)" — the enemy units
      // present, not the battlefield's controller, make it a legal destination.
    } else if (
      targetIsBattlefield &&
      Boolean(targetBfId) &&
      standardTimingOk &&
      occupiedPermissionAllowsBattlefield(
        state,
        context.zones,
        (id) =>
          (context.cards.getCardController?.(id) as string | undefined) ??
          (context.cards.getCardOwner(id) as string | undefined),
        context.params.cardId as string,
        context.params.playerId as string,
        targetBfId as string,
      )
    ) {
      // rule 355.2 / 740.2.a (unl-117-219): "can be played to an occupied
      // battlefield if an enemy unit is alone there" — printed on the card or
      // granted to friendly units by a permanent on the board.
    } else if (
      targetIsBattlefield &&
      Boolean(targetBfId) &&
      (standardTimingOk || reactionTimingOk) &&
      battlefieldRedirectPowerFor(targetBfId as string, context.params.cardId as string) !== undefined
    ) {
      // rule 356.2 / 355.2 (ven-157-166): the BATTLEFIELD offers any player an
      // optional additional cost that plays a matching card to itself — the
      // permission comes from the destination, not from the played card, and it
      // does not care who controls the battlefield. The extra pips are charged
      // in the affordability gate below and by the reducer.
    } else if (targetIsBattlefield && !hasAmbush) {
      return false;
    } else if (targetIsBattlefield) {
      // Ambush path: relax phase / active-player gating and permit the
      // Unit to be played directly to the target battlefield.
      const bfId = extractBattlefieldId(location ?? "");
      if (!bfId) {
        return false;
      }
      const bfZoneId = getBattlefieldZoneId(bfId);
      const unitsAtBattlefield = context.zones.getCardsInZone(
        bfZoneId as CoreZoneId,
        context.params.playerId as CorePlayerId,
      );
      const hasFriendlyUnits = unitsAtBattlefield.length > 0;
      // rule 813.1.c.1 / 310.1.a: Ambush grants [Reaction] TIMING, not a
      // permission to act when this player may not act at all. Reaction
      // windows are Closed states (priority holder) and Showdowns (Focus
      // holder); a Neutral Open State belongs to the turn player alone, so
      // the opponent may not Ambush in during it.
      const ambushWindowOpen =
        standardTimingOk || reactionWindowOpen(state, context.params.playerId as string);
      if (!canPlayViaAmbush(hasAmbush, hasFriendlyUnits, ambushWindowOpen)) {
        return false;
      }
    } else if (!reactionTimingOk) {
      // Standard play path: active player, main phase.
      if (state.turn.activePlayer !== context.params.playerId) {
        return false;
      }
      if (state.turn.phase !== "main") {
        return false;
      }
      // Rule 140.1.b/c + 508.1.a: Playing a Unit is a Discretionary Action,
      // legal only in a Neutral Open state (no chain, no showdown).
      const interaction = state.interaction ?? createInteractionState();
      if (getTurnState(interaction) !== "neutral-open") {
        return false;
      }
    }

    // rule-id: unl-178-219 (rule 560) — when paying an optional cost with an
    // "I cost [N] less" rider, affordability is tested against the discounted
    // base cost. rule 805.1.a: a declared Accelerate / "you may pay" extra is
    // paid on top of the base cost, so the combined total must be affordable.
    // rule 356.4.c.1 (sfd-149-221): when the caller names WHICH discounted
    // shape it pays, honour it as long as it is one the payer may choose.
    const payableOptions = context.params.paidAdditionalCost
      ? payableOptionalCostVariants(
          state,
          context.params.playerId as string,
          context.params.cardId as string,
          { cards: context.cards, zones: context.zones },
        )
      : [];
    const declaredSpec = context.params.additionalCostSpec as
      | { energy?: number; power?: readonly string[] }
      | undefined;
    const payable = context.params.paidAdditionalCost
      ? (declaredSpec !== undefined
          ? payableOptions.find((o) => sameOptionalCostSpec(o, declaredSpec))
          : undefined) ?? payableOptions[0]
      : undefined;
    if (context.params.paidAdditionalCost && declaredSpec !== undefined && payableOptions.length > 0 && payable === undefined) {
      return false;
    }
    // rule 364.3.a (unl-122-219) — declaring a payment the card does not offer
    // right now (gate unmet, or too little XP) is not a legal play; without this
    // the play would slip through charging only the base cost.
    if (context.params.paidAdditionalCost && payableOptions.length === 0) {
      const kind = effectiveOptionalPlayCost(state, context.params.playerId as string, context.params.cardId as string, {
        cards: context.cards,
        zones: context.zones,
      })?.kind;
      if (kind === "pay" || kind === "accelerate") {
        return false;
      }
    }
    // rule 356.2.b / 204.2 (ogn-002-298) — "you may discard N as an additional
    // cost. If you do, reduce my cost by [N]": the discarded card must be a
    // different card in hand, and the rider nets against the base cost.
    const discardCost = context.params.paidAdditionalCost
      ? getOptionalPlayCost(context.params.cardId as string)
      : undefined;
    if (discardCost?.kind === "discard" && (discardCost.discard ?? 0) === 1) {
      const discardId = context.params.discardId as string | undefined;
      if (!discardId || discardId === (context.params.cardId as string)) {
        return false;
      }
      if (context.zones.getCardZone(discardId as CoreCardId) !== "hand") {
        return false;
      }
      if (context.cards.getCardOwner(discardId as CoreCardId) !== context.params.playerId) {
        return false;
      }
      return canAffordCard(
        state,
        context.params.playerId,
        context.params.cardId,
        {
          additionalCost: { energy: -(discardCost.energyDiscount ?? 0) },
          board: { cards: context.cards, zones: context.zones },
        },
        createMetaAccessor(context.cards),
        getPotentialRuneEnergy(context.zones, context.counters, context.params.playerId),
      );
    }
    // rule-id: ven-096-166 — board/trash access so self-scaled and friendly
    // static cost reductions (rule 466) apply to unit plays.
    const board = { cards: context.cards, zones: context.zones };

    // rule 356.2.b / 414.4 (sfd-079-221) — "you may exhaust your legend as an
    // additional cost": declaring the payment needs a READY legend.
    if (
      context.params.paidAdditionalCost === true &&
      hasLegendExhaustCost(context.params.cardId as string) &&
      readyLegendId(context.zones, context.counters, context.params.playerId as string) ===
        undefined
    ) {
      return false;
    }

    // rule 356.2.a.1 / 357.2 (ogn-208-298) — "As an additional cost to play me,
    // kill a friendly unit": mandatory, so a play naming no victim is not a
    // legal play at all.
    const mandatoryCost = getOptionalPlayCost(context.params.cardId as string);
    if (
      mandatoryCost?.kind === "kill" &&
      mandatoryCost.mandatory === true &&
      context.params.sacrificeId === undefined
    ) {
      return false;
    }

    // rule 356.2.a.1 (sfd-044-221) — "As an additional cost to play me, return
    // a friendly gear to its owner's hand": mandatory, and the named payment
    // must really be a friendly gear on the board.
    if (mandatoryCost?.kind === "return-to-hand") {
      const bounceId = context.params.sacrificeId as string | undefined;
      if (bounceId === undefined) {
        return mandatoryCost.mandatory !== true;
      }
      if (
        !friendlyBoardGear(state, context.zones, context.cards, context.params.playerId as string).includes(
          bounceId,
        )
      ) {
        return false;
      }
    }

    // rule 560 / 702.2.b (ogn-150-298) — "you may spend any number of buffs as
    // an additional cost. Reduce my cost by [body] for each buff you spend":
    // every named unit must be a friendly buffed unit, and the play is priced
    // with that many pips waived.
    // rule 356.2.b / 356.4 (ogn-231-298) — "kill any number of friendly units …
    // reduce my cost by [order] for each killed this way": every named unit must
    // be a friendly board unit, and the play is priced with that many pips waived.
    const sacrificeIds = context.params.sacrificeIds as string[] | undefined;
    if (sacrificeIds && sacrificeIds.length > 0) {
      const killCost = getKillAnyNumberCost(context.params.cardId as string);
      if (!killCost) {
        return false;
      }
      const killable = friendlyKillableUnits(
        state,
        context.zones,
        context.params.playerId as string,
      );
      if (new Set(sacrificeIds).size !== sacrificeIds.length) {
        return false;
      }
      if (!sacrificeIds.every((id) => killable.includes(id))) {
        return false;
      }
      return canAffordCard(
        state,
        context.params.playerId,
        context.params.cardId,
        {
          board,
          waivePower: { [killCost.domain]: sacrificeIds.length },
          // rule 356.2.b — a second, independent optional cost (Accelerate) elected on the
          // same play; the legacy flag alone means "this object cost", so only an explicit spec counts.
          ...(payable && declaredSpec !== undefined
            ? { additionalCost: { energy: payable.energy, power: payable.power } }
            : {}),
        },
        createMetaAccessor(context.cards),
        getPotentialRuneEnergy(context.zones, context.counters, context.params.playerId),
      );
    }

    const spentBuffIds = context.params.spentBuffIds as string[] | undefined;
    if (spentBuffIds && spentBuffIds.length > 0) {
      const buffCost = getBuffSpendCost(context.params.cardId as string);
      if (!buffCost) {
        return false;
      }
      const spendable = friendlyBuffedUnits(
        state,
        context.zones,
        context.cards,
        context.params.playerId as string,
      );
      const unique = new Set(spentBuffIds);
      if (unique.size !== spentBuffIds.length) {
        return false;
      }
      if (!spentBuffIds.every((id) => spendable.includes(id))) {
        return false;
      }
      return canAffordCard(
        state,
        context.params.playerId,
        context.params.cardId,
        {
          board,
          waivePower: { [buffCost.domain]: spentBuffIds.length },
          // rule 356.2.b (ogn-150-298 Kraken Hunter) — Accelerate AND spent buffs on one
          // play; the legacy flag alone means "this object cost", so only an explicit spec counts.
          ...(payable && declaredSpec !== undefined
            ? { additionalCost: { energy: payable.energy, power: payable.power } }
            : {}),
        },
        createMetaAccessor(context.cards),
        getPotentialRuneEnergy(context.zones, context.counters, context.params.playerId),
      );
    }
    // rule 356.1 (unl-089-219) — the elected alternate play cost replaces the
    // printed cost; it is legal only while its condition holds.
    let altCost: { energy?: number; power?: readonly string[] } | undefined;
    // rule 356.1 (unl-025-219) — a self-granted trash play always charges the
    // permission's cost, no `altCost` election needed.
    if (zone === "trash") {
      altCost = getSelfTrashPlayCost(
        state,
        context.params.playerId as string,
        context.params.cardId as string,
      );
    }
    if (context.params.altCost === true) {
      altCost = getAlternatePlayCost(
        state,
        context.params.playerId as string,
        context.params.cardId as string,
      );
      if (!altCost) {
        return false;
      }
    }
    // rule-id: unl-170-219 (rule 356.4) — a paid "kill a friendly unit" cost
    // whose card carries the discount rider prices the play against the named
    // victim's printed cost. Only a real friendly board unit counts.
    const killDiscount =
      mandatoryCost?.kind === "kill" &&
      typeof context.params.sacrificeId === "string" &&
      friendlyKillableUnits(state, context.zones, context.params.playerId as string).includes(
        context.params.sacrificeId as string,
      )
        ? getSacrificeCostDiscount(
            context.params.cardId as string,
            context.params.sacrificeId as string,
          )
        : undefined;
    if (
      !canAffordCard(
        state,
        context.params.playerId,
        context.params.cardId,
        payable
          ? { additionalCost: { energy: payable.energy, power: payable.power }, board, ...(altCost ? { altCost } : {}) }
          : {
              board,
              ...(altCost ? { altCost } : {}),
              ...(killDiscount
                ? { additionalCost: { energy: -killDiscount.energy }, waivePower: killDiscount.power }
                : {}),
            },
        createMetaAccessor(context.cards),
        getPotentialRuneEnergy(context.zones, context.counters, context.params.playerId),
      )
    ) {
      return false;
    }

    // rule 356.2 (ven-157-166): the destination battlefield's optional
    // additional cost is paid ON TOP of the printed cost, so a Dragon whose
    // controller cannot spare the pips may not be played here at all.
    const redirectPips = chargedRedirectPower(
      state,
      context.params.playerId as string,
      context.params.cardId as string,
      location,
      context.params.paidAdditionalCost === true,
    );
    if (
      redirectPips &&
      !canAffordCard(
        state,
        context.params.playerId,
        context.params.cardId,
        { additionalCost: { power: redirectPips }, board, ...(altCost ? { altCost } : {}) },
        createMetaAccessor(context.cards),
        getPotentialRuneEnergy(context.zones, context.counters, context.params.playerId),
      )
    ) {
      return false;
    }

    return true;
  },
  enumerator: (state, context) => {
    if (state.status !== "playing") {
      return [];
    }
    if (state.pendingChoice) {
      return [];
    }
    // Rule ven-123-166 / 577.3.c: Ambush lets a unit be played to a
    // battlefield with friendly units at reaction timing, so the
    // active-player / main-phase / neutral-open gates only govern the
    // standard base-play path — do not early-return here.
    const interaction = state.interaction ?? createInteractionState();
    const standardTiming =
      state.turn.activePlayer === (context.playerId as string) &&
      state.turn.phase === "main" &&
      getTurnState(interaction) === "neutral-open";
    // rule 813.1.c.1 / 813.1.c: [Reaction] units are offered in any window
    // where their controller may act (chain priority, showdown Focus, or a
    // Neutral Open state on either player's turn).
    const reactionWindow = reactionWindowOpen(state, context.playerId as string);

    const registry = getGlobalCardRegistry();
    const pool = state.runePools[context.playerId as string];
    if (!pool) {
      return [];
    }
    // Rule 357.1.a: credit ready runes as available energy for enumeration.
    const potential = getPotentialRuneEnergy(
      context.zones,
      context.counters,
      context.playerId as string,
    );
    const board = { cards: context.cards, zones: context.zones };
    const metaForAfford = createMetaAccessor(context.cards);

    const handCards = context.zones.getCardsInZone(
      "hand" as CoreZoneId,
      context.playerId as CorePlayerId,
    );

    // rule 419.1 (rule-id: ven-022-166) — with "You may play cards from your
    // trash" on board, trash cards are offered alongside the hand.
    const trashCards = context.zones.getCardsInZone(
      "trash" as CoreZoneId,
      context.playerId as CorePlayerId,
    );
    // rule 812 / 366.1 (unl-025-219) — without a board-wide grant, a trash card
    // may still carry its OWN "you may play me from your trash" permission.
    const playableCards = hasPlayFromTrashGrant(state, context.zones, context.playerId as string)
      ? [...handCards, ...trashCards]
      : [
          ...handCards,
          ...trashCards.filter(
            (id) =>
              getSelfTrashPlayCost(state, context.playerId as string, id as string) !== undefined,
          ),
        ];

    const results: RiftboundMoves["playUnit"][] = [];
    // rule 356.2 (unl-166-219) — a "kill a pet" / "return a gear" additional
    // cost is a cost of PLAYING the card, so it applies on every path that
    // enumerated a destination (including the Ambush reaction window), and a
    // mandatory one leaves no unpaid variant behind.
    const expandPaidCostVariants = (
      cardIdArg: string,
      optional: ReturnType<typeof getOptionalPlayCost>,
    ): void => {
      if (optional?.kind !== "kill" && optional?.kind !== "return-to-hand") {
        return;
      }
      const locations = enumeratedLocations(results, cardIdArg);
      let victims: readonly string[];
      if (optional.kind === "kill") {
        victims = resolveTarget(
          {
            ...(optional.kill as Record<string, unknown>),
            quantity: "all",
          } as Parameters<typeof resolveTarget>[0],
          {
            cards: context.cards as Parameters<typeof resolveTarget>[1]["cards"],
            draft: state,
            playerId: context.playerId as string,
            sourceCardId: cardIdArg,
            zones: context.zones,
          },
        );
      } else {
        victims = friendlyBoardGear(state, context.zones, context.cards, context.playerId as string);
      }
      if (optional.mandatory) {
        for (let i = results.length - 1; i >= 0; i--) {
          if (
            results[i]?.cardId === cardIdArg &&
            (results[i] as { sacrificeId?: string }).sacrificeId === undefined
          ) {
            results.splice(i, 1);
          }
        }
      }
      for (const sacrificeId of victims) {
        for (const location of locations) {
          results.push({
            cardId: cardIdArg,
            location,
            paidAdditionalCost: true,
            playerId: context.playerId as string,
            sacrificeId,
          });
        }
      }
    };
    for (const cardId of playableCards) {
      // rule 356.1 (unl-025-219) — a self-granted trash play replaces the
      // printed cost for every affordability check below.
      const selfTrashCost =
        context.zones.getCardZone(cardId as CoreCardId) === "trash"
          ? getSelfTrashPlayCost(state, context.playerId as string, cardId as string)
          : undefined;
      const def = registry.get(cardId as string);
      if (!def || def.cardType !== "unit") {
        continue;
      }
      // rule 419.1 (ven-029-166) — keep the enumerator in sync with condition.
      if (selfPlayIsForbidden(state, context.playerId as string, cardId as string)) {
        continue;
      }
      // Rule 560 / 717: when the unit declares a payable optional additional
      // play-cost, build the paid variant so callers can elect to pay it.
      // rule-id: unl-178-219 — an XP cost with an "I cost [N] less" rider can
      // make the paid variant affordable even when the unpaid play is not.
      const payable = resolvePayableOptionalCost(state, context.playerId as string, cardId as string, board);
      // rule 356.2.b / 204.2 (ogn-002-298): offer one paid variant per other
      // card in hand for a "you may discard 1 as an additional cost" play.
      const discardCost = getOptionalPlayCost(cardId as string);
      const discardVariants: RiftboundMoves["playUnit"][] = [];
      if (
        standardTiming &&
        discardCost?.kind === "discard" &&
        (discardCost.discard ?? 0) === 1 &&
        canAffordCard(
          state,
          context.playerId as string,
          cardId as string,
          { additionalCost: { energy: -(discardCost.energyDiscount ?? 0) }, board },
          metaForAfford,
          potential,
        )
      ) {
        for (const fodder of handCards) {
          if ((fodder as string) === (cardId as string)) {
            continue;
          }
          discardVariants.push({
            cardId: cardId as string,
            discardId: fodder as string,
            location: "base",
            paidAdditionalCost: true,
            playerId: context.playerId as string,
          });
        }
      }
      // rule 560 / 702.2.b (ogn-150-298): "spend any number of buffs … reduce
      // my cost by [body] for each" — offer one variant per spendable set of
      // friendly buffs whose waiver makes the play affordable.
      const buffCost = standardTiming ? getBuffSpendCost(cardId as string) : undefined;
      const buffVariants: RiftboundMoves["playUnit"][] = [];
      if (buffCost) {
        const spendable = friendlyBuffedUnits(
          state,
          context.zones,
          context.cards,
          context.playerId as string,
        );
        for (const subset of buffSpendSubsets(spendable)) {
          if (
            canAffordCard(
              state,
              context.playerId as string,
              cardId as string,
              { board, waivePower: { [buffCost.domain]: subset.length } },
              metaForAfford,
              potential,
            )
          ) {
            buffVariants.push({
              cardId: cardId as string,
              location: "base",
              paidAdditionalCost: true,
              playerId: context.playerId as string,
              spentBuffIds: subset,
            });
          }
        }
      }
      // rule 356.2.b / 356.4 (ogn-231-298): "kill any number of friendly units …
      // reduce my cost by [order] for each" — offer one variant per killable set
      // whose waiver makes the play affordable.
      const killAnyCost = standardTiming ? getKillAnyNumberCost(cardId as string) : undefined;
      const killAnyVariants: RiftboundMoves["playUnit"][] = [];
      if (killAnyCost) {
        const killable = friendlyKillableUnits(state, context.zones, context.playerId as string);
        for (const subset of buffSpendSubsets(killable)) {
          if (
            canAffordCard(
              state,
              context.playerId as string,
              cardId as string,
              { board, waivePower: { [killAnyCost.domain]: subset.length } },
              metaForAfford,
              potential,
            )
          ) {
            killAnyVariants.push({
              cardId: cardId as string,
              location: "base",
              paidAdditionalCost: true,
              playerId: context.playerId as string,
              sacrificeIds: subset,
              // single-kill variants also carry `sacrificeId` so a caller naming
              // one unit to sacrifice matches without knowing about the list form.
              ...(subset.length === 1 ? { sacrificeId: subset[0] as string } : {}),
            });
          }
        }
      }
      // rule 560 / 805.1.a: the optional cost is paid ON TOP of the base cost, so
      // affordability is the combined total (base [C] pip + Accelerate's [C] pip
      // needs two power), not the extra checked in isolation.
      // rule 356.4.c.1 (sfd-149-221): one variant per way the payer may shave a
      // flexible "[1] or [rainbow] less" discount off this optional cost.
      const paidVariants: RiftboundMoves["playUnit"][] = [];
      for (const option of payableOptionalCostVariants(
        state,
        context.playerId as string,
        cardId as string,
        board,
      )) {
        if (
          !canAffordCard(
            state,
            context.playerId as string,
            cardId as string,
            { additionalCost: { energy: option.energy, power: option.power }, board },
            metaForAfford,
            potential,
          )
        ) {
          continue;
        }
        paidVariants.push({
          additionalCostSpec: {
            energy: option.energy,
            power: option.power,
            ...(option.xp > 0 ? { xp: option.xp } : {}),
          },
          cardId: cardId as string,
          location: "base",
          paidAdditionalCost: true,
          playerId: context.playerId as string,
        } satisfies RiftboundMoves["playUnit"]);
      }
      const paidVariant = paidVariants[0];
      // rule 356.2.b — several optional costs on one card are independent
      // (Kraken Hunter: [Accelerate] AND "spend any number of buffs"): offer
      // each affordable combination of a payable variant with an object-cost
      // variant, so both can be elected on the same play.
      const comboVariants: RiftboundMoves["playUnit"][] = [];
      for (const option of buffVariants.length + killAnyVariants.length > 0
        ? payableOptionalCostVariants(state, context.playerId as string, cardId as string, board)
        : []) {
        const pv: RiftboundMoves["playUnit"] = {
          additionalCostSpec: {
            energy: option.energy,
            power: option.power,
            ...(option.xp > 0 ? { xp: option.xp } : {}),
          },
          cardId: cardId as string,
          location: "base",
          paidAdditionalCost: true,
          playerId: context.playerId as string,
        };
        const spec = pv.additionalCostSpec as { energy?: number; power?: readonly string[] } | undefined;
        for (const ov of [...buffVariants, ...killAnyVariants]) {
          const waive =
            ov.spentBuffIds && buffCost
              ? { [buffCost.domain]: ov.spentBuffIds.length }
              : ov.sacrificeIds && killAnyCost
                ? { [killAnyCost.domain]: ov.sacrificeIds.length }
                : undefined;
          if (
            waive &&
            canAffordCard(
              state,
              context.playerId as string,
              cardId as string,
              { additionalCost: { energy: spec?.energy ?? 0, power: spec?.power ?? [] }, board, waivePower: waive },
              metaForAfford,
              potential,
            )
          ) {
            comboVariants.push({ ...ov, ...pv, location: ov.location });
          }
        }
      }
      buffVariants.push(...comboVariants.filter((v) => v.spentBuffIds !== undefined));
      killAnyVariants.push(...comboVariants.filter((v) => v.sacrificeIds !== undefined));

      // rule 356.1 (unl-089-219) — "If you've spent [4] or more to play a
      // spell this turn, you may play me for [mind]": an alternate play cost
      // is a second, cheaper way to play the same card, offered alongside the
      // printed-cost play (and available even when that one is unaffordable).
      const alt = standardTiming
        ? getAlternatePlayCost(state, context.playerId as string, cardId as string)
        : undefined;
      const altVariant =
        alt &&
        canAffordCard(
          state,
          context.playerId as string,
          cardId as string,
          { altCost: alt, board },
          metaForAfford,
          potential,
        )
          ? ({
              altCost: true,
              cardId: cardId as string,
              location: "base",
              playerId: context.playerId as string,
            } satisfies RiftboundMoves["playUnit"])
          : undefined;

      // rule-id: ven-096-166 — gate on canAffordCard with board access so
      // self-scaled / friendly static cost reductions are visible here.
      if (
        !canAffordCard(
          state,
          context.playerId as string,
          cardId as string,
          { board, ...(selfTrashCost ? { altCost: selfTrashCost } : {}) },
          metaForAfford,
          potential,
        )
      ) {
        if (standardTiming) {
          results.push(...paidVariants);
        }
        if (altVariant) {
          results.push(altVariant);
        }
        results.push(...discardVariants);
        results.push(...buffVariants);
        results.push(...killAnyVariants);
        // rule-id: unl-170-219 (rule 356.4) — "kill a friendly unit … I cost
        // [1] less per Energy and [D] less per Power it costs": the discount
        // is what makes the play affordable, so the paid variants must be
        // offered even though the printed cost is out of reach.
        if (standardTiming && getOptionalPlayCost(cardId as string)?.kind === "kill") {
          for (const victim of friendlyKillableUnits(
            state,
            context.zones,
            context.playerId as string,
          )) {
            const discount = getSacrificeCostDiscount(cardId as string, victim);
            if (
              discount &&
              canAffordCard(
                state,
                context.playerId as string,
                cardId as string,
                { additionalCost: { energy: -discount.energy }, board, waivePower: discount.power },
                metaForAfford,
                potential,
              )
            ) {
              results.push({
                cardId: cardId as string,
                location: "base",
                paidAdditionalCost: true,
                playerId: context.playerId as string,
                sacrificeId: victim,
              });
            }
          }
        }
        continue;
      }

      // Rule ven-123-166 / 577.3.c: offer Ambush plays to any battlefield
      // where the player already has friendly units (reaction timing —
      // legal even outside the active player's main phase / neutral-open).
      // rule 310.1.a: but Reaction TIMING is not a permission to act — only
      // offer it in a window this player may act in (own neutral-open, chain
      // priority, or showdown Focus), never in the opponent's Neutral Open.
      if (registry.hasKeyword(cardId as string, "Ambush") && (standardTiming || reactionWindow)) {
        for (const bfId of Object.keys(state.battlefields ?? {})) {
          const bfZoneId = getBattlefieldZoneId(bfId);
          const friendly = context.zones.getCardsInZone(
            bfZoneId as CoreZoneId,
            context.playerId as CorePlayerId,
          );
          // rule 822.1.d / 355.2 (unl-120-219): a card whose text extends
          // Ambush to battlefields holding enemy units may be Ambushed into any
          // such battlefield with no friendly unit there — it need not already
          // be contested (ruling 581f4d14f9876f8a) — but a running Showdown
          // narrows the offer to its own battlefield (ven-179-166).
          const enemyBfOk =
            ambushEnemyBattlefieldOpen(state, bfId) &&
            canPlayToEnemyOccupiedBattlefield(cardId as string) &&
            battlefieldHasEnemyUnits(
              context.zones,
              (id) =>
                (context.cards.getCardController?.(id) as string | undefined) ??
                (context.cards.getCardOwner(id) as string | undefined),
              bfId,
              context.playerId as string,
            );
          if (friendly.length > 0 || enemyBfOk) {
            results.push({
              cardId: cardId as string,
              location: bfZoneId as string,
              playerId: context.playerId as string,
            });
          }
        }
      }

      // rule 813.1.c.1: a [Reaction] unit is offered to its 355.2.a defaults
      // (base / a controlled battlefield) while its controller holds priority.
      const reactionPlay = reactionWindow && unitHasReaction(cardId as string);
      if (!standardTiming && !reactionPlay) {
        // rule 356.2 (unl-166-219): an Ambush reaction still pays the card's
        // additional cost — expand the destinations just enumerated.
        expandPaidCostVariants(cardId as string, discardCost);
        continue;
      }

      // Rule sfd-015-221: only battlefields conquered this turn are legal.
      if (playOnlyToConqueredBattlefield(cardId as string)) {
        if (!standardTiming) {
          continue;
        }
        const conquered = state.conqueredThisTurn?.[context.playerId as string] ?? [];
        for (const bfId of conquered) {
          if (!state.battlefields?.[bfId]) {
            continue;
          }
          const bfZoneId = getBattlefieldZoneId(bfId) as string;
          if (results.some((r) => r.cardId === (cardId as string) && r.location === bfZoneId)) {
            continue;
          }
          results.push({
            cardId: cardId as string,
            location: bfZoneId,
            playerId: context.playerId as string,
          });
        }
        continue;
      }

      results.push({
        cardId: cardId as string,
        location: "base",
        playerId: context.playerId as string,
      });
      if (altVariant) {
        results.push(altVariant);
      }

      // rule 356.2.b / 414.4 (sfd-079-221) — "you may exhaust your legend as an
      // additional cost": offer the paid variant only while a legend is ready.
      if (
        standardTiming &&
        hasLegendExhaustCost(cardId as string) &&
        readyLegendId(context.zones, context.counters, context.playerId as string) !== undefined
      ) {
        results.push({
          cardId: cardId as string,
          location: "base",
          paidAdditionalCost: true,
          playerId: context.playerId as string,
        });
      }

      // Rule 355.2.a: a Battlefield the controller controls is a default
      // valid play location.
      for (const [bfId, bf] of Object.entries(state.battlefields ?? {})) {
        if (bf.controller !== (context.playerId as string)) {
          continue;
        }
        const bfZoneId = getBattlefieldZoneId(bfId) as string;
        if (results.some((r) => r.cardId === (cardId as string) && r.location === bfZoneId)) {
          continue;
        }
        results.push({
          cardId: cardId as string,
          location: bfZoneId,
          playerId: context.playerId as string,
        });
      }

      // rule 355.2 (sfd-025-221): offer the battlefield this player is
      // currently attacking when the card grants CanPlayToAttacked.
      if (canPlayToAttackedBattlefield(cardId as string)) {
        for (const bfId of Object.keys(state.battlefields ?? {})) {
          // rule 464.2.c: only a COMBAT showdown has an Attacker — an empty
          // battlefield merely contested by a Standard Move is not attacked.
          if (
            !battlefieldIsAttackedBy(state, bfId, context.playerId as string) ||
            !battlefieldHasEnemyUnits(
              context.zones,
              (id) =>
                (context.cards.getCardController?.(id) as string | undefined) ??
                (context.cards.getCardOwner(id) as string | undefined),
              bfId,
              context.playerId as string,
            )
          ) {
            continue;
          }
          const bfZoneId = getBattlefieldZoneId(bfId) as string;
          if (results.some((r) => r.cardId === (cardId as string) && r.location === bfZoneId)) {
            continue;
          }
          results.push({
            cardId: cardId as string,
            location: bfZoneId,
            playerId: context.playerId as string,
          });
        }
      }

      // Rule ogn-174-298 / ogn-193-298: offer open (uncontrolled)
      // battlefields when the card carries a static play-restriction
      // permitting it, or a friendly board unit grants it.
      if (
        standardTiming &&
        canPlayToOpenBattlefield(
          state,
          context.zones,
          cardId as string,
          context.playerId as string,
        )
      ) {
        for (const bfId of Object.keys(state.battlefields ?? {})) {
          const bfZoneId = getBattlefieldZoneId(bfId) as string;
          if (results.some((r) => r.cardId === (cardId as string) && r.location === bfZoneId)) {
            continue;
          }
          // rule 170.11.c: open = uncontrolled AND unoccupied
          if (battlefieldIsOpen(state, context.zones, bfId)) {
            results.push({
              cardId: cardId as string,
              location: getBattlefieldZoneId(bfId) as string,
              playerId: context.playerId as string,
            });
          }
        }
      }

      // rule 355.2.b (ogn-161-298): offer occupied enemy battlefields when the
      // card carries the matching static play-restriction.
      if (standardTiming && canPlayToOccupiedEnemyBattlefield(cardId as string)) {
        for (const bfId of Object.keys(state.battlefields ?? {})) {
          const bfZoneId = getBattlefieldZoneId(bfId) as string;
          if (results.some((r) => r.cardId === (cardId as string) && r.location === bfZoneId)) {
            continue;
          }
          if (
            battlefieldIsOccupiedEnemy(state, context.zones, bfId, context.playerId as string)
          ) {
            results.push({
              cardId: cardId as string,
              location: bfZoneId,
              playerId: context.playerId as string,
            });
          }
        }
      }

      // rule 356.2 / 355.2 (ven-157-166): a battlefield whose own text offers
      // an optional additional cost to play a matching card HERE is a legal
      // destination for any player who can pay the extra pips on top.
      if (standardTiming || reactionWindow) {
        for (const bfId of Object.keys(state.battlefields ?? {})) {
          const bfZoneId = getBattlefieldZoneId(bfId) as string;
          const pips = battlefieldRedirectPowerFor(bfId, cardId as string);
          if (
            !pips ||
            !canAffordCard(
              state,
              context.playerId as string,
              cardId as string,
              { additionalCost: { power: pips }, board },
              metaForAfford,
              potential,
            )
          ) {
            continue;
          }
          const sameDest = results.filter(
            (r) => r.cardId === (cardId as string) && r.location === bfZoneId,
          );
          if (sameDest.some((r) => r.paidAdditionalCost === true)) {
            continue;
          }
          // rule 356.2 — the offer is open to ANY player, the battlefield's own
          // controller included. Their plain play here is already legal
          // (355.2.a), so for them it is the PAID variant that still has to be
          // enumerated rather than the destination skipped entirely.
          const plainAlreadyOffered = sameDest.length > 0;
          results.push({
            cardId: cardId as string,
            location: bfZoneId,
            playerId: context.playerId as string,
            ...(plainAlreadyOffered ? { paidAdditionalCost: true } : {}),
          });
        }
      }

      // rule 355.2 (unl-120-219): offer any battlefield holding enemy units
      // when the card grants CanPlayToEnemyBattlefield.
      if (canPlayToEnemyOccupiedBattlefield(cardId as string)) {
        for (const bfId of Object.keys(state.battlefields ?? {})) {
          const bfZoneId = getBattlefieldZoneId(bfId) as string;
          if (results.some((r) => r.cardId === (cardId as string) && r.location === bfZoneId)) {
            continue;
          }
          if (
            battlefieldHasEnemyUnits(
              context.zones,
              (id) =>
                (context.cards.getCardController?.(id) as string | undefined) ??
                (context.cards.getCardOwner(id) as string | undefined),
              bfId,
              context.playerId as string,
            )
          ) {
            results.push({
              cardId: cardId as string,
              location: bfZoneId,
              playerId: context.playerId as string,
            });
          }
        }
      }

      // rule 355.2 / 740.2.a (unl-117-219): offer occupied battlefields granted
      // by a `can-play-to-occupied` static — the card's own, or one a friendly
      // permanent hands to every friendly unit (365.1).
      if (standardTiming) {
        for (const bfId of Object.keys(state.battlefields ?? {})) {
          const bfZoneId = getBattlefieldZoneId(bfId) as string;
          if (results.some((r) => r.cardId === (cardId as string) && r.location === bfZoneId)) {
            continue;
          }
          if (
            occupiedPermissionAllowsBattlefield(
              state,
              context.zones,
              (id) =>
                (context.cards.getCardController?.(id) as string | undefined) ??
                (context.cards.getCardOwner(id) as string | undefined),
              cardId as string,
              context.playerId as string,
              bfId,
            )
          ) {
            results.push({
              cardId: cardId as string,
              location: bfZoneId,
              playerId: context.playerId as string,
            });
          }
        }
      }

      // Rule 560 / 717: when the unit declares an optional additional
      // play-cost, also enumerate the paid variant so callers can elect
      // to pay it.
      const optional = discardCost;
      results.push(...discardVariants);
      results.push(...buffVariants);
      results.push(...killAnyVariants);
      if (paidVariant) {
        results.push(...paidVariants);
        // rule 805.2 (unl-024-219, Accelerate) — an optional additional cost is
        // a cost of PLAYING me, not of playing me to my base: every non-base
        // location already offered for the free play gets a paid twin, so
        // "[Accelerate] and land ready at a battlefield I control" is legal.
        const paidLocations = new Set(
          results
            .filter(
              (r) =>
                r.cardId === (cardId as string) &&
                r.paidAdditionalCost !== true &&
                r.location !== undefined &&
                r.location !== "base",
            )
            .map((r) => r.location as string),
        );
        for (const location of paidLocations) {
          for (const variant of paidVariants) {
            results.push({ ...variant, location });
          }
        }
      } else {
        expandPaidCostVariants(cardId as string, optional);
      }

      // rule 356.2.b (sfd-079-221) — exhausting your legend is likewise a cost
      // of PLAYING me, not of playing me to my base: mirror the paid variant
      // onto every other location already offered for the free play.
      if (
        standardTiming &&
        hasLegendExhaustCost(cardId as string) &&
        readyLegendId(context.zones, context.counters, context.playerId as string) !== undefined
      ) {
        const legendLocations = new Set(
          results
            .filter(
              (r) =>
                r.cardId === (cardId as string) &&
                r.paidAdditionalCost !== true &&
                r.location !== undefined &&
                r.location !== "base",
            )
            .map((r) => r.location as string),
        );
        for (const location of legendLocations) {
          if (
            results.some(
              (r) =>
                r.cardId === (cardId as string) &&
                r.location === location &&
                r.paidAdditionalCost === true,
            )
          ) {
            continue;
          }
          results.push({
            cardId: cardId as string,
            location,
            paidAdditionalCost: true,
            playerId: context.playerId as string,
          });
        }
      }
    }
    // rule 355.2 (ogn-070-298): while an enemy Mageseeker Warden is at a
    // battlefield, this player may only play units to their base.
    if (opponentsRestrictedToBase(state, context.zones, context.playerId as string)) {
      return results.filter((r) => !isBattlefieldZone(r.location)).map((r) => withCostsParam(r));
    }
    // rule 355.2 (sfd-216-221): drop destinations whose battlefield forbids
    // unit plays ("Units can't be played here").
    return results
      .filter(
        (r) =>
          !isBattlefieldZone(r.location) ||
          !battlefieldForbidsUnitPlay(extractBattlefieldId(r.location) ?? ""),
      )
      .map((r) => withCostsParam(r));
  },
  reducer: (draft, rawContext) => {
    const context = rawContext.params.costs
      ? { ...rawContext, params: legacyParamsFromSelection(rawContext.params.cardId as string, rawContext.params) }
      : rawContext;
    const { cardId, playerId, location, paidAdditionalCost, additionalCostSpec, sacrificeId, sacrificeIds, discardId, spentBuffIds, altCost } =
      context.params;
    const { zones, counters } = context;
    // rule 340.2.a / 347.1 — playing this unit as a Focus action during a
    // Showdown passes Focus once it has landed (checked at the tail).
    const preInteraction = draft.interaction ?? createInteractionState();
    const wasFocusAction =
      !preInteraction.chain?.items.length &&
      getActiveShowdown(preInteraction)?.focusPlayer === playerId;

    // Rule 560: optional additional cost. Re-derive from the card definition
    // instead of trusting client-supplied additionalCostSpec/sacrificeId — a
    // multiplayer client could otherwise trash an opponent's card or claim an
    // Accelerate benefit the card doesn't have.
    // rule 805.2 (sfd-029-221) — a board static may GRANT Accelerate to this
    // non-hand play; read it through the same helper the enumerator uses.
    const optional = paidAdditionalCost
      ? effectiveOptionalPlayCost(draft, playerId as string, cardId as string, { cards: context.cards, zones })
      : undefined;
    // rule-id: unl-178-219 (rule 560) — "spend N XP as an additional cost; if
    // you do, I cost [N] less": spend the XP up front and charge the
    // discounted base cost. XP is only spent when the discounted play is
    // affordable so a rejected payment leaves the total untouched.
    let xpPaid = false;
    let energyDiscount = 0;
    if (optional?.kind === "accelerate" || optional?.kind === "pay") {
      const xpNeed = optional.cost?.xp ?? 0;
      const player = draft.players[playerId];
      if (xpNeed > 0 && player && player.xp >= xpNeed) {
        player.xp -= xpNeed;
        xpPaid = true;
        energyDiscount = optional.energyDiscount ?? 0;
      }
    }
    // rule 356.2.b / 204.2 (ogn-002-298) — discard the declared card from hand
    // as the additional cost; "If you do, reduce my cost by [N]" then applies.
    let discardPaid = false;
    if (optional?.kind === "discard" && discardId) {
      const owner = context.cards.getCardOwner(discardId as CoreCardId);
      const inHand = zones.getCardZone(discardId as CoreCardId) === "hand";
      if (owner === playerId && inHand && discardId !== cardId) {
        // rule 422 — a discard paid as a cost is still a discard event.
        removeFromBoard(
          { cards: context.cards, counters, draft, zones },
          [discardId as string],
          "trash",
          { by: playerId, kind: "discard", source: cardId as string },
          (event) => fireTriggers(event, { cards: context.cards, counters, draft, zones }),
        );
        discardPaid = true;
        energyDiscount = optional.energyDiscount ?? 0;
      }
    }

    // rule-id: ven-096-166 — board/trash access for static cost reductions.
    const board = { cards: context.cards, zones };

    // rule 560 / 702.2.b (ogn-150-298) — spend the declared buffs: each one
    // waives a pip of the card's power cost. Re-validate against the board
    // rather than trusting the client-supplied ids.
    const buffCost = getBuffSpendCost(cardId);
    const spentBuffs: string[] = [];
    if (buffCost && spentBuffIds && spentBuffIds.length > 0) {
      const spendable = friendlyBuffedUnits(draft, zones, context.cards, playerId);
      for (const id of spentBuffIds) {
        if (spendable.includes(id as string) && !spentBuffs.includes(id as string)) {
          spentBuffs.push(id as string);
        }
      }
    }
    // rule 356.2.b / 356.4 (ogn-231-298) — kill the declared friendly units: each
    // kill waives a pip of the card's Power cost. Re-validate against the board
    // rather than trusting the client-supplied ids.
    const killAnyCost = getKillAnyNumberCost(cardId);
    const sacrificed: string[] = [];
    if (killAnyCost && sacrificeIds && sacrificeIds.length > 0) {
      const killable = friendlyKillableUnits(draft, zones, playerId);
      for (const id of sacrificeIds) {
        if (killable.includes(id as string) && !sacrificed.includes(id as string)) {
          sacrificed.push(id as string);
        }
      }
    }
    // rule-id: unl-170-219 (rule 356.4) — the named victim's printed cost is
    // the discount; re-derived from the board, never trusted from the caller.
    const killDiscount =
      optional?.kind === "kill" &&
      typeof sacrificeId === "string" &&
      friendlyKillableUnits(draft, zones, playerId).includes(sacrificeId)
        ? getSacrificeCostDiscount(cardId, sacrificeId)
        : undefined;
    if (killDiscount) {
      energyDiscount += killDiscount.energy;
    }
    const waivePower =
      buffCost && spentBuffs.length > 0
        ? { [buffCost.domain]: spentBuffs.length }
        : killAnyCost && sacrificed.length > 0
          ? { [killAnyCost.domain]: sacrificed.length }
          : killDiscount && Object.keys(killDiscount.power).length > 0
            ? killDiscount.power
            : undefined;

    // rule 356.4.f (rule-id: sfd-103-221) — Energy discount left over once the
    // printed cost is already 0. It keeps eating an optional additional cost
    // (charged below), so read it BEFORE `deductCost` consumes one-shot riders.
    const discountOverflow = getPlayEnergyDiscountOverflow(
      draft,
      playerId,
      cardId,
      { board },
      createMetaAccessor(context.cards),
    );

    // rule 356.1 (unl-089-219) — the elected alternate play cost replaces the
    // printed cost. Re-derived here, never trusted from the caller.
    const altCostSpec =
      // rule 356.1 (unl-025-219) — a self-granted trash play charges the
      // permission's cost; re-derived here, never trusted from the caller.
      (zones.getCardZone(cardId as CoreCardId) === "trash"
        ? getSelfTrashPlayCost(draft, playerId, cardId)
        : undefined) ??
      (altCost === true ? getAlternatePlayCost(draft, playerId, cardId) : undefined);
    // rule 356.4.d / 356.4.f — same story for the pip half: waivers the printed
    // (or alternate) pips did not use keep eating the optional additional cost
    // charged below. Read BEFORE `deductCost` consumes the one-shot discount.
    const pipOverflow = getPlayPowerDiscountOverflow(
      draft,
      playerId,
      cardId,
      { board, ...(altCostSpec ? { altCost: altCostSpec } : {}) },
      createMetaAccessor(context.cards),
    );
    // rule 356.2 (ven-157-166): the destination battlefield's optional
    // additional cost rides on top of the printed cost.
    const redirectPips = chargedRedirectPower(
      draft,
      playerId as string,
      cardId as string,
      location as string | undefined,
      paidAdditionalCost === true,
    );
    deductCost(
      draft,
      playerId,
      cardId,
      {
        board,
        ...(altCostSpec ? { altCost: altCostSpec } : {}),
        ...(energyDiscount > 0 || redirectPips
          ? {
              additionalCost: {
                ...(energyDiscount > 0 ? { energy: -energyDiscount } : {}),
                ...(redirectPips ? { power: redirectPips } : {}),
              },
            }
          : {}),
        ...(waivePower ? { waivePower } : {}),
      },
      createMetaAccessor(context.cards),
      // rule 357.1.a: tap ready runes for any Energy shortfall at Pay time.
      { counters: context.counters, zones: context.zones },
    );

    // rule 702.2.b: spending a buff removes it; Might readers look at
    // top-level meta.buffed, so mirror the counter flag there.
    for (const id of spentBuffs) {
      counters.setFlag(id as CoreCardId, "buffed", false);
      context.cards.updateCardMeta?.(
        id as CoreCardId,
        { buffed: false } as Partial<RiftboundCardMeta>,
      );
    }
    // rule 702.2.b: each buff spent is its own event ("When you spend a buff"
    // fires once per buff, so spending two buffs mints two Gold tokens).
    for (const id of spentBuffs) {
      fireTriggers(
        { cardId, playerId, spentFrom: id as string, type: "spend-buff" },
        { cards: context.cards, counters, draft, zones },
      );
    }

    // rule 428.1: paying the kill cost is a real kill — route through the kill
    // effect so Deathknell / "when a friendly unit dies" triggers fire and a
    // die-replacement can apply (rule 357.2.a: a replaced cost still counts as paid).
    for (const id of sacrificed) {
      executeEffect(
        { target: { type: "unit" }, type: "kill" },
        {
          boundTargets: [id],
          cards: context.cards,
          counters,
          draft,
          fireTriggers: (event) =>
            fireTriggers(event, { cards: context.cards, counters, draft, zones }),
          playerId,
          sourceCardId: cardId as string,
          zones,
        },
      );
    }

    let paidAccelerate = false;
    let paidAdditionalCostActual = discardPaid || sacrificed.length > 0;
    if (paidAdditionalCost) {
      const pool = draft.runePools[playerId];
      // rule 356.2.b — on a play that paid an OBJECT cost (buffs / kills /
      // discard) the bare legacy flag names that cost; the resource cost
      // (Accelerate / "you may pay") is a second election made only by an
      // explicit `additionalCostSpec`.
      const objectCostOnly =
        additionalCostSpec === undefined && (spentBuffs.length > 0 || sacrificed.length > 0 || discardPaid);
      if ((optional?.kind === "accelerate" || optional?.kind === "pay") && pool && !objectCostOnly) {
        // rule 356.4.c (sfd-149-221): pay the cost as discounted by friendly
        // "optional additional costs you pay cost [1] or [rainbow] less" statics.
        // rule 356.4.c.1 (sfd-149-221): the payer may name which half of the
        // cost a flexible "[1] or [rainbow] less" discount shaves; an
        // unrecognised spec falls back to the engine's default choice.
        const options = payableOptionalCostVariants(draft, playerId, cardId as string, board);
        const declared = options.find((o) => sameOptionalCostSpec(o, additionalCostSpec));
        const need: { energy?: number; power?: readonly string[]; xp?: number } =
          additionalCostSpec !== undefined && declared
            ? { energy: declared.energy, power: declared.power, xp: optional.cost?.xp }
            : discountOptionalPlayCost(draft, playerId, optional.cost, board) ?? {};
        const xpOk = (need.xp ?? 0) === 0 || xpPaid;
        // rule 356.4.f / 356.4.f.1 — a discount that overflowed the printed
        // Energy cost also pays this one, and paying 0 still counts as paying.
        const needEnergy = Math.max(0, (need.energy ?? 0) - discountOverflow);
        // rule 135.2.e.5.a/b — an additional cost's pips obey the same Power
        // rules as a printed cost: pooled [rainbow] Power pays a named-Domain
        // pip, and a [rainbow] pip is payable from any Domain.
        const needPips = applyPowerWaiversToPips(need.power ?? [], pipOverflow);
        const spend = planAdditionalCostPips(needPips, pool.power);
        const canPay = xpOk && pool.energy >= needEnergy && spend !== undefined;
        if (canPay && spend) {
          pool.energy -= needEnergy;
          for (const [domain, count] of Object.entries(spend)) {
            const key = domain as keyof typeof pool.power;
            pool.power[key] = (pool.power[key] ?? 0) - count;
          }
          // rule 364.3.a — an additional cost's pips are power spent this turn too.
          recordPowerSpent(draft, playerId, needPips.length);
          // rule 369.3 (unl-122-219) — "you may pay [chaos] … If you do, I
          // enter ready" replaces the entry exactly like a paid Accelerate.
          paidAccelerate = optional.kind === "accelerate" || optional.entersReadyIfPaid === true;
          paidAdditionalCostActual = true;
        }
      } else if (optional?.kind === "kill" && sacrificeId) {
        const owner = context.cards.getCardOwner(sacrificeId as CoreCardId);
        const zone = context.zones.getCardZone(sacrificeId as CoreCardId);
        const inPlay =
          zone === "base" ||
          (typeof zone === "string" && zone.startsWith("battlefield-"));
        const kind = getGlobalCardRegistry().get(sacrificeId as string)?.cardType;
        const okType =
          !optional.kill?.type ||
          optional.kill.type === "permanent" ||
          optional.kill.type === kind;
        if (owner === playerId && inPlay && sacrificeId !== cardId && okType) {
          // rule 428.1: the cost-kill is a real kill — Deathknell and "when a
          // friendly unit dies" triggers fire and a die-replacement may apply.
          // rule 357.2.a: a cost replaced this way still counts as paid.
          executeEffect(
            { target: { type: "unit" }, type: "kill" },
            {
              boundTargets: [sacrificeId as string],
              cards: context.cards,
              counters,
              draft,
              fireTriggers: (event) =>
                fireTriggers(event, { cards: context.cards, counters, draft, zones }),
              playerId,
              sourceCardId: cardId as string,
              zones,
            },
          );
          paidAdditionalCostActual = true;
        }
      } else if (
        optional?.kind === "exhaust" &&
        (optional.exhaust as { type?: string } | undefined)?.type === "legend"
      ) {
        // rule 356.2.b / 414.4 (sfd-079-221) — exhaust the ready legend as the
        // additional cost; re-derived from the board, never client-supplied.
        const legendId = readyLegendId(zones, counters, playerId);
        if (legendId !== undefined) {
          counters.setFlag(legendId as CoreCardId, "exhausted", true);
          context.cards.updateCardMeta?.(
            legendId as CoreCardId,
            { exhausted: true } as Partial<RiftboundCardMeta>,
          );
          paidAdditionalCostActual = true;
        }
      } else if (optional?.kind === "return-to-hand" && sacrificeId) {
        // rule 356.2.a.1 (sfd-044-221) — pay the cost now, while the play is
        // being finalized: the gear is in its OWNER's hand before anything can
        // respond, and it stays there even if the unit never lands.
        const zone = context.zones.getCardZone(sacrificeId as CoreCardId);
        const inPlay =
          zone === "base" || (typeof zone === "string" && zone.startsWith("battlefield-"));
        const controller =
          (context.cards.getCardController?.(sacrificeId as CoreCardId) as string | undefined) ??
          (context.cards.getCardOwner(sacrificeId as CoreCardId) as string | undefined);
        const type = getGlobalCardRegistry().getCardType(sacrificeId as string);
        if (
          controller === playerId &&
          inPlay &&
          sacrificeId !== cardId &&
          (type === "gear" || type === "equipment")
        ) {
          executeEffect(
            { target: { type: "gear" }, type: "return-to-hand" },
            {
              boundTargets: [sacrificeId as string],
              cards: context.cards,
              counters,
              draft,
              fireTriggers: (event) =>
                fireTriggers(event, { cards: context.cards, counters, draft, zones }),
              playerId,
              sourceCardId: cardId as string,
              zones,
            },
          );
          paidAdditionalCostActual = true;
        }
      }
    }

    const paidIds = paidAdditionalCostActual ? paidIdsFromLegacyParams(cardId, context.params) : [];
    // rule 357.2 / 371.2 (rule-id: ogn-208-298 × ogn-023-298) — the cost-kill
    // met an OPTIONAL costed die replacement ("you may pay [fury] to … instead"):
    // its controller answers now, in the middle of paying; the unit enters only
    // once that prompt settles (`completeSuspendedPlay`, from the prompt's
    // cleanup). Everything else is already paid, so nothing is asked twice.
    if (draft.pendingChoice) {
      draft.suspendedPlay = {
        cardId,
        kind: "playUnit",
        location: location as string,
        paidAccelerate,
        paidAdditionalCost: paidAdditionalCostActual,
        paidIds,
        playerId,
        wasFocusAction,
      };
      return;
    }
    completeUnitPlay(draft, context, {
      cardId,
      kind: "playUnit",
      location: location as string,
      paidAccelerate,
      paidAdditionalCost: paidAdditionalCostActual,
      paidIds,
      playerId,
      wasFocusAction,
    });
  },
};

/**
 * rule 359.2 — the second half of a unit play, once every cost is paid: the
 * unit leaves the chain for the board (entry zone / exhausted / enter-ready
 * replacements), its play triggers fire, Legion counts it, an arrival contests
 * the battlefield, [Weaponmaster] is offered, and a Focus action passes Focus.
 * Split out so a play suspended mid-payment (`draft.suspendedPlay`) resumes
 * exactly here.
 */
export function completeUnitPlay(
  draft: RiftboundGameState,
  // biome-ignore lint/suspicious/noExplicitAny: engine move context is framework-typed
  context: any,
  play: NonNullable<RiftboundGameState["suspendedPlay"]>,
): void {
  const { cardId, playerId, location, paidAccelerate, wasFocusAction } = play;
  const { zones, counters } = context as {
    zones: Parameters<NonNullable<Defs["playUnit"]["reducer"]>>[1]["zones"];
    counters: Parameters<NonNullable<Defs["playUnit"]["reducer"]>>[1]["counters"];
  };
  // rule 359.2 — the ONE enter path (`play-pipeline.ts`): battlefield-token
  // entry replacement, exhausted / enter-ready / Accelerate, play triggers with
  // the paid additional costs, Legion count, arrival contest, [Weaponmaster].
  const from = zones.getCardZone(cardId as CoreCardId) as string | undefined;
  enterPlayedPermanent(
    { cards: context.cards, counters, draft, zones },
    {
      cardId,
      entersReady: paidAccelerate,
      entryZone: location,
      from,
      paidAdditionalCost: play.paidAdditionalCost,
      paidIds: play.paidIds,
      playerId,
      // rule 419.1 / 366.1 — a hand move made from the trash is a PERMISSION play.
      via: from === "trash" ? "permission" : "hand",
    },
  );

  // rule 337.2 / 339.1 / 340.4 — a unit item resolves the instant it is
  // finalized and so never sits on the Chain: playing it still restarts the run
  // of passes, and once nothing is Pending the controller of the newest
  // REMAINING item (not this player) gains Priority. `finalizeSweepTouched` is
  // what the end-of-move finalization sweep reads to reseat Priority.
  if (draft.interaction?.chain?.items.length) {
    draft.finalizeSweepTouched = true;
  }

  // rule 340.2.a / 347.1 — the unit resolved on finalize with nothing left
  // on the chain and no prompt outstanding: Focus passes to the next
  // Relevant Player. A play-trigger chain keeps Focus where it is (346.1).
  // rule 347.1.b / 340.2.a — the unit resolved immediately, so a chain that
  // exists now was OPENED by this card's own play triggers as part of a Focus
  // action of playing a card. That is not a trigger-opened chain for rule
  // 346.1 purposes: Focus must still pass when it empties.
  if (wasFocusAction && draft.interaction?.chain?.openedByTrigger) {
    draft.interaction.chain.openedByTrigger = false;
  }
  if (wasFocusAction && !draft.pendingChoice && draft.interaction) {
    const post = draft.interaction;
    if (!post.chain?.items.length && getActiveShowdown(post)?.focusPlayer === playerId) {
      draft.interaction = advanceFocusAfterAction(post);
    }
  }
}

/**
 * rule 357.2.a — finish a unit play that was suspended while one of its object
 * costs waited on a prompt (see `draft.suspendedPlay`). Called from the prompt
 * layer once no choice is open; a replaced cost-kill still counts as paid.
 */
export function completeSuspendedPlay(
  draft: RiftboundGameState,
  // biome-ignore lint/suspicious/noExplicitAny: engine move context is framework-typed
  context: any,
): void {
  const play = draft.suspendedPlay;
  if (!play || draft.pendingChoice) {
    return;
  }
  draft.suspendedPlay = undefined;
  if (play.kind === "playUnit") {
    completeUnitPlay(draft, context, play);
  }
}
