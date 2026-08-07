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
import { canPlayViaAmbush } from "../../../keywords/keyword-effects";
import { contestBattlefieldOnArrival } from "../movement/contest-arrival";
import {
  cleanupAndFireDeaths,
  type PostMoveCleanupContext,
} from "../../../cleanup/post-move-cleanup";
import { applyPlayBattlefieldToken } from "./battlefield-token";
import {
  extractBattlefieldId,
  getBattlefieldZoneId,
  isBattlefieldZone,
} from "../../../zones/zone-configs";
import {
  staticEnterReadyApplies,
  boardEntersReadyGrantApplies,
  canPlayToOpenBattlefield,
  canPlayToOccupiedEnemyBattlefield,
  canPlayToEnemyOccupiedBattlefield,
  battlefieldHasEnemyUnits,
  canPlayToAttackedBattlefield,
  battlefieldIsAttackedBy,
  battlefieldIsOccupiedEnemy,
  battlefieldIsOpen,
  opponentsRestrictedToBase,
  battlefieldForbidsUnitPlay,
  playOnlyToConqueredBattlefield,
  consumeEntersReadyReplacement,
  getBuffSpendCost,
  getKillAnyNumberCost,
  getOptionalPlayCost,
  createMetaAccessor,
  getPotentialRuneEnergy,
  canAffordCard,
  deductCost,
  discountOptionalPlayCost,
  hasPlayFromTrashGrant,
} from "./cost";
import type { CostExtras } from "./cost";

type Defs = GameMoveDefinitions<RiftboundGameState, RiftboundMoves, RiftboundCardMeta, unknown>;

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
  const optional = getOptionalPlayCost(cardId);
  if (optional?.kind !== "accelerate" && optional?.kind !== "pay") {
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
 * Play a unit to Base (rule 554)
 */
export const playUnit: Defs["playUnit"] = {
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

    const zone = context.zones.getCardZone(context.params.cardId as CoreCardId);
    if (
      zone !== "hand" &&
      // rule 419.1 (rule-id: ven-022-166) — "You may play cards from your
      // trash" makes the trash a legal play-from zone for its controller.
      !(
        zone === "trash" &&
        hasPlayFromTrashGrant(state, context.zones, context.params.playerId as string)
      )
    ) {
      return false;
    }

    // Rule 103 / 555: only the card's owner may play it.
    const owner = context.cards.getCardOwner(context.params.cardId as CoreCardId);
    if (owner !== context.params.playerId) {
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
      battlefieldIsAttackedBy(state, targetBfId as string, context.params.playerId as string)
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
      (standardTimingOk || reactionTimingOk) &&
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
      // Reaction timing is always legal per `isLegalTiming("reaction", ...)`
      // Regardless of chain/showdown state, so we treat Ambush as
      // Permanently reaction-legal and rely on `canPlayViaAmbush`'s
      // Friendly-units check.
      if (!canPlayViaAmbush(hasAmbush, hasFriendlyUnits, true)) {
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
    const payable = context.params.paidAdditionalCost
      ? resolvePayableOptionalCost(
          state,
          context.params.playerId as string,
          context.params.cardId as string,
          { cards: context.cards, zones: context.zones },
        )
      : undefined;
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
        { board, waivePower: { [killCost.domain]: sacrificeIds.length } },
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
        { board, waivePower: { [buffCost.domain]: spentBuffIds.length } },
        createMetaAccessor(context.cards),
        getPotentialRuneEnergy(context.zones, context.counters, context.params.playerId),
      );
    }
    if (
      !canAffordCard(
        state,
        context.params.playerId,
        context.params.cardId,
        payable
          ? { additionalCost: { energy: payable.energy, power: payable.power }, board }
          : { board },
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
    const playableCards = hasPlayFromTrashGrant(state, context.zones, context.playerId as string)
      ? [
          ...handCards,
          ...context.zones.getCardsInZone("trash" as CoreZoneId, context.playerId as CorePlayerId),
        ]
      : handCards;

    const results: RiftboundMoves["playUnit"][] = [];
    for (const cardId of playableCards) {
      const def = registry.get(cardId as string);
      if (!def || def.cardType !== "unit") {
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
      const paidVariant =
        payable &&
        canAffordCard(
          state,
          context.playerId as string,
          cardId as string,
          { additionalCost: { energy: payable.energy, power: payable.power }, board },
          metaForAfford,
          potential,
        )
          ? ({
              additionalCostSpec: {
                energy: payable.energy,
                power: payable.power,
                ...(payable.xp > 0 ? { xp: payable.xp } : {}),
              },
              cardId: cardId as string,
              location: "base",
              paidAdditionalCost: true,
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
          { board },
          metaForAfford,
          potential,
        )
      ) {
        if (paidVariant && standardTiming) {
          results.push(paidVariant);
        }
        results.push(...discardVariants);
        results.push(...buffVariants);
        results.push(...killAnyVariants);
        continue;
      }

      // Rule ven-123-166 / 577.3.c: offer Ambush plays to any battlefield
      // where the player already has friendly units (reaction timing —
      // legal even outside the active player's main phase / neutral-open).
      if (registry.hasKeyword(cardId as string, "Ambush")) {
        for (const bfId of Object.keys(state.battlefields ?? {})) {
          const bfZoneId = getBattlefieldZoneId(bfId);
          const friendly = context.zones.getCardsInZone(
            bfZoneId as CoreZoneId,
            context.playerId as CorePlayerId,
          );
          if (friendly.length > 0) {
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
          if (!battlefieldIsAttackedBy(state, bfId, context.playerId as string)) {
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

      // Rule 560 / 717: when the unit declares an optional additional
      // play-cost, also enumerate the paid variant so callers can elect
      // to pay it.
      const optional = discardCost;
      results.push(...discardVariants);
      results.push(...buffVariants);
      results.push(...killAnyVariants);
      if (paidVariant) {
        results.push(paidVariant);
      } else if (optional?.kind === "kill") {
        const killDescriptor = {
          ...(optional.kill as Record<string, unknown>),
          quantity: "all" as const,
        };
        const sacrificeOptions = resolveTarget(
          killDescriptor as Parameters<typeof resolveTarget>[0],
          {
            cards: context.cards as Parameters<typeof resolveTarget>[1]["cards"],
            draft: state,
            playerId: context.playerId as string,
            sourceCardId: cardId as string,
            zones: context.zones,
          },
        );
        // rule 356.2.a.1 (ogn-208-298) — a MANDATORY additional kill cost has
        // no unpaid variant: drop the plain plays enumerated for this card so
        // only victim-naming ones remain (none ⇒ the card cannot be played).
        if (optional.mandatory) {
          for (let i = results.length - 1; i >= 0; i--) {
            if (
              results[i]?.cardId === (cardId as string) &&
              (results[i] as { sacrificeId?: string }).sacrificeId === undefined
            ) {
              results.splice(i, 1);
            }
          }
        }
        for (const sacrificeId of sacrificeOptions) {
          results.push({
            cardId: cardId as string,
            location: "base",
            paidAdditionalCost: true,
            playerId: context.playerId as string,
            sacrificeId,
          });
        }
      }
    }
    // rule 355.2 (ogn-070-298): while an enemy Mageseeker Warden is at a
    // battlefield, this player may only play units to their base.
    if (opponentsRestrictedToBase(state, context.zones, context.playerId as string)) {
      return results.filter((r) => !isBattlefieldZone(r.location));
    }
    // rule 355.2 (sfd-216-221): drop destinations whose battlefield forbids
    // unit plays ("Units can't be played here").
    return results.filter(
      (r) =>
        !isBattlefieldZone(r.location) ||
        !battlefieldForbidsUnitPlay(extractBattlefieldId(r.location) ?? ""),
    );
  },
  reducer: (draft, context) => {
    const { cardId, playerId, location, paidAdditionalCost, additionalCostSpec, sacrificeId, sacrificeIds, discardId, spentBuffIds } =
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
    const optional = paidAdditionalCost ? getOptionalPlayCost(cardId) : undefined;
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
        zones.moveCard({ cardId: discardId as CoreCardId, targetZoneId: "trash" as CoreZoneId });
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
    const waivePower =
      buffCost && spentBuffs.length > 0
        ? { [buffCost.domain]: spentBuffs.length }
        : killAnyCost && sacrificed.length > 0
          ? { [killAnyCost.domain]: sacrificed.length }
          : undefined;

    deductCost(
      draft,
      playerId,
      cardId,
      {
        board,
        ...(energyDiscount > 0 ? { additionalCost: { energy: -energyDiscount } } : {}),
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
    if (spentBuffs.length > 0) {
      fireTriggers(
        { cardId, playerId, type: "spend-buff" },
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
      if ((optional?.kind === "accelerate" || optional?.kind === "pay") && pool) {
        // rule 356.4.c (sfd-149-221): pay the cost as discounted by friendly
        // "optional additional costs you pay cost [1] or [rainbow] less" statics.
        const need = discountOptionalPlayCost(draft, playerId, optional.cost, board) ?? {};
        const xpOk = (need.xp ?? 0) === 0 || xpPaid;
        const canPay =
          xpOk &&
          pool.energy >= (need.energy ?? 0) &&
          (need.power ?? []).every((d: string) => (pool.power[d as keyof typeof pool.power] ?? 0) >= 1);
        if (canPay) {
          pool.energy -= need.energy ?? 0;
          for (const domain of need.power ?? []) {
            const key = domain as keyof typeof pool.power;
            pool.power[key] = (pool.power[key] ?? 0) - 1;
          }
          paidAccelerate = optional.kind === "accelerate";
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
      }
    }

    // rule 135.2.b.3 / 369.3 (unl-147-219): an "as you play me, add the …
    // battlefield token; if you do, I enter there" clause runs during the play
    // and replaces where the unit enters (play-location restrictions do not
    // apply to an entry replacement).
    const entryZone =
      applyPlayBattlefieldToken({ cardId, draft, playerId, zones: zones as never }) ?? location;

    zones.moveCard({
      cardId: cardId as CoreCardId,
      targetZoneId: entryZone as CoreZoneId,
    });

    // Rule 143.4: units enter exhausted unless a static "I enter ready"
    // effect (enter-ready) says otherwise (e.g. Eager Drakehound sfd-006-221),
    // Accelerate was paid (rule 717), or a runtime `enters-ready` replacement
    // (rule 571 — Sun Disc ogn-021-298) applies.
    // rule-id: unl-052-219 — the "next unit you play" replacement is consumed
    // by this unit regardless of other enter-ready sources, so evaluate it
    // first (it may also carry a Buff rider for the entering unit).
    const replacedReady = consumeEntersReadyReplacement(draft, playerId, {
      cardId,
      ctx: { cards: context.cards, counters, zones },
    });
    // rule-id: ven-091-166 — a conditional "I enter ready" static must have
    // its condition evaluated at play time (e.g. score not within 3 of the
    // Victory Score); an unconditional one always applies.
    // rule 369.3 (rule-id: ogn-011-298): a friendly board static may also
    // grant "enters ready" to the units its controller plays.
    const entersReady =
      replacedReady ||
      staticEnterReadyApplies(cardId, draft, playerId, zones) ||
      boardEntersReadyGrantApplies(draft, zones, cardId, playerId) ||
      paidAccelerate;
    if (!entersReady) {
      counters.setFlag(cardId as CoreCardId, "exhausted", true);
    }

    // Fire "play-self" and "play-card" triggers BEFORE incrementing the
    // Rule-724 counter, so a Legion trigger on this card itself cannot
    // Satisfy its own condition — it must observe the count of cards
    // That were played EARLIER in this turn.
    fireTriggers(
      { cardId, paidAdditionalCost: paidAdditionalCostActual, playerId, type: "play-self" },
      { cards: context.cards, counters, draft, zones },
    );
    fireTriggers(
      { cardId, cardType: "unit", playerId, type: "play-card" },
      { cards: context.cards, counters, draft, zones },
    );

    // Rule 724 (Legion) tracker: count this play so subsequent cards
    // Can satisfy their Legion conditions. Runes are NOT counted.
    if (draft.cardsPlayedThisTurn) {
      draft.cardsPlayedThisTurn[playerId] = (draft.cardsPlayedThisTurn[playerId] ?? 0) + 1;
    }

    // rule 190.3.a.1 / 323.11.a: a unit played to a battlefield its controller
    // doesn't control (e.g. "You may play me to an open battlefield") contests
    // it exactly as a Standard Move would, staging the showdown.
    if (isBattlefieldZone(entryZone)) {
      const arrivedAt = extractBattlefieldId(entryZone);
      if (arrivedAt) {
        contestBattlefieldOnArrival({
          arrivingUnitIds: [cardId],
          battlefieldId: arrivedAt,
          cards: context.cards,
          counters,
          draft,
          playerId,
          zones,
        });
      }
      // rule 464.2.c.3.a: a unit that becomes present at a battlefield during
      // an ongoing combat gains its Attacker/Defender designation at the next
      // Cleanup. `contestBattlefieldOnArrival` only stamps the arriving side of
      // a battlefield its controller does NOT control, so a Reaction unit
      // played to one you already hold (a defender joining mid-combat) needs
      // the cleanup pass to designate it.
      cleanupAndFireDeaths(draft, context as unknown as PostMoveCleanupContext);
    }

    // rule-id: ven-041-166-weaponmaster-on-play-equip
    // Weaponmaster is a `{type:"keyword"}` ability, so trigger-matcher never
    // schedules it. Surface the "you may Equip … for [rainbow] less" prompt
    // directly: when the just-played unit has Weaponmaster and the player
    // owns any on-board equipment, block on a pendingChoice so the
    // controller can pick one (or decline). The reduced Equip cost is
    // charged by the weaponmaster-equip reducer (rule 821.1.c;
    // rule-id: sfd-119-221-weaponmaster-pays-reduced-equip-cost).
    if (
      !draft.pendingChoice &&
      getGlobalCardRegistry().hasKeyword(cardId, "Weaponmaster")
    ) {
      const registry = getGlobalCardRegistry();
      const boardZones: string[] = ["base"];
      for (const bfId of Object.keys(draft.battlefields ?? {})) {
        boardZones.push(getBattlefieldZoneId(bfId));
      }
      const equipOptions: string[] = [];
      for (const zoneId of boardZones) {
        for (const id of zones.getCardsInZone(
          zoneId as CoreZoneId,
          playerId as CorePlayerId,
        )) {
          // rule 208.3 / 476.1 (ven-027-166 Hand Hammer) — a gear with the
          // printed [Equip] ability IS Equipment. VEN cards come from set JSON
          // typed simply as "gear", so accept them the same way `equipCard`
          // does instead of gating on the "equipment" card type alone.
          const equipDef = registry.get(id as string);
          const isEquipment =
            equipDef?.cardType === "equipment" ||
            (equipDef?.cardType === "gear" && registry.hasKeyword(id as string, "Equip"));
          if (isEquipment) {
            equipOptions.push(id as string);
          }
        }
      }
      if (equipOptions.length > 0) {
        draft.pendingChoice = {
          options: equipOptions,
          playerId,
          type: "weaponmaster-equip",
          unitId: cardId,
        };
      }
    }

    // rule 340.2.a / 347.1 — the unit resolved on finalize with nothing left
    // on the chain and no prompt outstanding: Focus passes to the next
    // Relevant Player. A play-trigger chain keeps Focus where it is (346.1).
    if (wasFocusAction && !draft.pendingChoice && draft.interaction) {
      const post = draft.interaction;
      if (!post.chain?.items.length && getActiveShowdown(post)?.focusPlayer === playerId) {
        draft.interaction = advanceFocusAfterAction(post);
      }
    }
  },
};
