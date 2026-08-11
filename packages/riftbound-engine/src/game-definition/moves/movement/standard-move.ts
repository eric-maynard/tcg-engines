/**
 * standardMove move (split from movement.ts).
 */

import type {
  CardId as CoreCardId,
  PlayerId as CorePlayerId,
  ZoneId as CoreZoneId,
  GameMoveDefinitions,
} from "@tcg/core";
import { collapseTriggerBatch, createInteractionState, getTurnState } from "../../../chain";
import { type ArrivalIO, noteArrival } from "../../../operations/arrive-at-battlefield";
import type { RiftboundCardMeta, RiftboundGameState, RiftboundMoves } from "../../../types";
import type { PlayerId } from "../../../types/game-state";
import { getGlobalCardRegistry } from "../../../operations/card-lookup";
import { areAllies } from "../../../operations/teams";
import { fireTriggers } from "../../../abilities/trigger-runner";
import {
  battlefieldAcceptsMoveFromAnywhere,
  getMoveEscalationSurcharge,
  hasKeyword,
  isInvalidMoveDestination,
  payMoveEscalationSurcharge,
  relocateAttachedEquipment,
  totalPowerAvailable,
} from "./helpers";

/**
 * rule 350.1 / ogn-203-298 (Possession): moves are made by the unit's CURRENT
 * controller, not its owner — a stolen unit moves for its new controller and
 * no longer for the player who owns the card.
 */
function controllerOf(
  cards: {
    getCardOwner: (cardId: CoreCardId) => unknown;
    getCardController?: (cardId: CoreCardId) => string | undefined;
  },
  cardId: CoreCardId,
): string | undefined {
  return cards.getCardController?.(cardId) ?? (cards.getCardOwner(cardId) as string | undefined);
}

type Defs = GameMoveDefinitions<RiftboundGameState, RiftboundMoves, RiftboundCardMeta, unknown>;

/**
 * Standard Move
 *
 * Exhaust unit(s) to move them to a valid destination.
 * Valid destinations:
 * - Base <-> Battlefield
 * - Battlefield -> Battlefield (requires Ganking keyword)
 *
 * Multiple units can move together to the same destination.
 */
export const standardMove: Defs["standardMove"] = {
  condition: (state, context) => {
    if (state.pendingChoice) {
      return false;
    }
    if (state.status !== "playing") {
      return false;
    }
    if (state.turn.activePlayer !== context.params.playerId) {
      return false;
    }
    if (state.turn.phase !== "main") {
      return false;
    }
    // Rule 140.1.b/c + 589.1.a: Standard Move is a Discretionary Action,
    // legal only in a Neutral Open state (no chain, no showdown).
    const interaction = state.interaction ?? createInteractionState();
    if (getTurnState(interaction) !== "neutral-open") {
      return false;
    }

    const { unitIds, playerId, destination } = context.params;
    const toBase = destination === "base";
    // rule 144.4.a.1 / 410.1.b.3 — a battlefield already holding units of two
    // OTHER players is never a Standard Move destination.
    // rule 447.2.b — nor is one a TEAMMATE occupies.
    if (
      !toBase &&
      isInvalidMoveDestination(
        destination,
        playerId,
        (zoneId) => context.zones.getCardsInZone(zoneId),
        (cardId) => controllerOf(context.cards, cardId as CoreCardId),
        (other) => areAllies(state, playerId as PlayerId, other as PlayerId),
      )
    ) {
      return false;
    }
    for (const unitId of unitIds) {
      const zone = context.zones.getCardZone(unitId as CoreCardId) as string | undefined;
      // rule 350.1 / unl-150-219 (Vex, Apathetic): "they can't move it this
      // turn" is modelled as a granted `NoMove` keyword — such a unit may take
      // no move leg at all.
      if (
        hasKeyword(
          unitId,
          "NoMove",
          (id: CoreCardId) => context.cards.getCardMeta(id) as Partial<RiftboundCardMeta> | undefined,
        )
      ) {
        return false;
      }
      // Rule 144.4.b: base → battlefield, or battlefield → base.
      if (toBase) {
        if (!zone?.startsWith("battlefield-")) {
          return false;
        }
        // rule 144.4.b / sfd-014-221 (Minotaur Reckoner): "Units can't move to
        // base" is modelled as a granted `NoMoveToBase` keyword — a unit
        // carrying it (printed or granted) may not take the base leg.
        if (
          hasKeyword(
            unitId,
            "NoMoveToBase",
            (id: CoreCardId) => context.cards.getCardMeta(id) as Partial<RiftboundCardMeta> | undefined,
          )
        ) {
          return false;
        }
      } else if (zone !== "base") {
        // rule 144.3.a/b + 810.1.b — one Standard Move may gather units from
        // DIFFERENT Origins as long as they share a Destination; a
        // battlefield→battlefield leg is only open to a unit with Ganking.
        if (
          zone === undefined ||
          !zone.startsWith("battlefield-") ||
          zone === `battlefield-${destination}` ||
          // rule 187.9 / unl-t01 — a destination with "Units can move here from
          // anywhere" opens the battlefield→battlefield leg without Ganking.
          (!battlefieldAcceptsMoveFromAnywhere(destination) &&
            !hasKeyword(
              unitId,
              "Ganking",
              (id: CoreCardId) =>
                context.cards.getCardMeta(id) as Partial<RiftboundCardMeta> | undefined,
            ))
        ) {
          return false;
        }
      }

      if (controllerOf(context.cards, unitId as CoreCardId) !== playerId) {
        return false;
      }

      if (context.counters.getFlag(unitId as CoreCardId, "exhausted")) {
        return false;
      }
    }

    // rule 204.4 — an applied cost from an enemy move-escalation card
    // (unl-163-219): [rainbow] per unit beyond the first when several units
    // move to ITS battlefield at the same time. rule 203 — a cost that cannot
    // be paid makes the action illegal; rule 135.2.e.5.a — POWER, not energy.
    const surcharge = getMoveEscalationSurcharge(
      state,
      playerId,
      unitIds.length,
      destination,
      (c) => context.cards.getCardOwner(c) as string | undefined,
      (z, p) => context.zones.getCardsInZone(z, p),
    );
    if (surcharge > 0 && totalPowerAvailable(state, playerId) < surcharge) {
      return false;
    }

    return true;
  },
  enumerator: (state, context) => {
    if (state.pendingChoice) {
      return [];
    }
    if (state.status !== "playing") {
      return [];
    }
    if (state.turn.activePlayer !== (context.playerId as string)) {
      return [];
    }
    if (state.turn.phase !== "main") {
      return [];
    }
    const interaction = state.interaction ?? createInteractionState();
    if (getTurnState(interaction) !== "neutral-open") {
      return [];
    }

    const registry = getGlobalCardRegistry();
    // A stolen unit sits in its OWNER's base zone, so scan every player's base
    // and keep the ones this player currently controls.
    const baseCards = Object.keys(state.players).flatMap((pid) =>
      context.zones.getCardsInZone("base" as CoreZoneId, pid as CorePlayerId),
    );

    const results: {
      playerId: string;
      unitIds: string[];
      destination: string;
    }[] = [];

    const readyUnits: string[] = [];
    for (const cardId of baseCards) {
      if (controllerOf(context.cards, cardId) !== (context.playerId as string)) {
        continue;
      }

      const def = registry.get(cardId as string);
      if (def?.cardType !== "unit") {
        continue;
      }

      if (context.counters.getFlag(cardId, "exhausted")) {
        continue;
      }

      // rule 350.1 / unl-150-219: a unit told it "can't move this turn".
      if (
        hasKeyword(
          cardId as string,
          "NoMove",
          (id: CoreCardId) => context.cards.getCardMeta(id) as Partial<RiftboundCardMeta> | undefined,
        )
      ) {
        continue;
      }

      readyUnits.push(cardId as string);
    }

    const subsetsOf = (units: readonly string[]): string[][] => {
      const out: string[][] = [];
      for (let mask = 1; mask < 1 << units.length; mask++) {
        const subset: string[] = [];
        for (let i = 0; i < units.length; i++) {
          if (mask & (1 << i)) {
            subset.push(units[i]);
          }
        }
        out.push(subset);
      }
      return out;
    };

    const metaAccessor = (id: CoreCardId) =>
      context.cards.getCardMeta(id) as Partial<RiftboundCardMeta> | undefined;

    // rule 144.3 / 144.3.a — a Standard Move may move multiple units together
    // to the same Destination as one action, and their Origins need not match.
    // rule 810.1.b — Ganking is what lets a unit already at a battlefield join
    // a move to another battlefield.
    for (const bfId of Object.keys(state.battlefields || {})) {
      // rule 144.4.a.1 / 410.1.b.3 — never offer a destination already holding
      // units of two other players.
      // rule 447.2.b — nor one a TEAMMATE occupies.
      if (
        isInvalidMoveDestination(
          bfId,
          context.playerId as string,
          (zoneId) => context.zones.getCardsInZone(zoneId),
          (cardId) => controllerOf(context.cards, cardId as CoreCardId),
          (other) => areAllies(state, context.playerId as PlayerId, other as PlayerId),
        )
      ) {
        continue;
      }
      const gankers: string[] = [];
      // rule 187.9 / unl-t01 (Baron Pit) — "Units can move here from anywhere"
      // lets any ready unit at another battlefield take this leg.
      const acceptsFromAnywhere = battlefieldAcceptsMoveFromAnywhere(bfId);
      for (const otherBfId of Object.keys(state.battlefields || {})) {
        if (otherBfId === bfId) {
          continue;
        }
        for (const cardId of context.zones.getCardsInZone(`battlefield-${otherBfId}` as CoreZoneId)) {
          if (controllerOf(context.cards, cardId) !== (context.playerId as string)) {
            continue;
          }
          if (registry.get(cardId as string)?.cardType !== "unit") {
            continue;
          }
          if (context.counters.getFlag(cardId, "exhausted")) {
            continue;
          }
          if (!acceptsFromAnywhere && !hasKeyword(cardId as string, "Ganking", metaAccessor)) {
            continue;
          }
          // rule 350.1 / unl-150-219: "can't move it this turn".
          if (hasKeyword(cardId as string, "NoMove", metaAccessor)) {
            continue;
          }
          gankers.push(cardId as string);
        }
      }
      for (const unitIds of subsetsOf([...readyUnits, ...gankers])) {
        results.push({
          destination: bfId,
          playerId: context.playerId as string,
          unitIds,
        });
      }
    }

    // Rule 144.4.b: battlefield → base. Enumerate ready owned units already
    // on any battlefield and offer them (and their subsets) moving to base.
    const readyBfUnits: string[] = [];
    for (const bfId of Object.keys(state.battlefields || {})) {
      const bfCards = context.zones.getCardsInZone(`battlefield-${bfId}` as CoreZoneId);
      for (const cardId of bfCards) {
        if (controllerOf(context.cards, cardId) !== (context.playerId as string)) {
          continue;
        }
        const def = registry.get(cardId as string);
        if (def?.cardType !== "unit") {
          continue;
        }
        if (context.counters.getFlag(cardId, "exhausted")) {
          continue;
        }
        // sfd-014-221: units carrying NoMoveToBase are never offered a base leg.
        if (hasKeyword(cardId as string, "NoMoveToBase", metaAccessor)) {
          continue;
        }
        // rule 350.1 / unl-150-219: "can't move it this turn".
        if (hasKeyword(cardId as string, "NoMove", metaAccessor)) {
          continue;
        }
        readyBfUnits.push(cardId as string);
      }
    }
    for (let mask = 1; mask < 1 << readyBfUnits.length; mask++) {
      const subset: string[] = [];
      for (let i = 0; i < readyBfUnits.length; i++) {
        if (mask & (1 << i)) {
          subset.push(readyBfUnits[i]);
        }
      }
      results.push({
        destination: "base",
        playerId: context.playerId as string,
        unitIds: subset,
      });
    }
    return results;
  },
  reducer: (draft, context) => {
    const { unitIds, destination, playerId } = context.params;
    const { zones, counters } = context;

    // rule 204.4 / 135.2.e.5.a — pay the applied cost in POWER of any domain
    // (unl-163-219 Mageseeker Investigator); energy is never touched.
    const surcharge = getMoveEscalationSurcharge(
      draft,
      playerId,
      unitIds.length,
      destination,
      (c) => context.cards.getCardOwner(c) as string | undefined,
      (z, p) => context.zones.getCardsInZone(z, p),
    );
    payMoveEscalationSurcharge(draft, playerId, surcharge);

    const toBase = destination === "base";
    // rule 144.3 — moving several units together is ONE Standard Move, so the
    // per-unit events carry their position in that single action: a trigger
    // templated on the PLAYER ("when an opponent moves") is met only once.
    let moveBatchIndex = 0;
    // rule 383.3.d / 446.3 — the movers of one Standard Move arrive
    // simultaneously, so the move triggers they hand out are ONE batch their
    // controller may order, not a fixed per-unit sequence.
    const chainLenBeforeMoves = draft.interaction?.chain?.items.length ?? 0;
    for (const unitId of unitIds) {
      // Capture the source zone before the move so the fired event
      // Reports accurate from/to locations.
      const fromZone =
        (context.zones.getCardZone(unitId as CoreCardId) as string | undefined) ?? "base";
      const toZone = toBase ? "base" : `battlefield-${destination}`;

      // Exhaust the unit (cost of moving)
      counters.setFlag(unitId as CoreCardId, "exhausted", true);

      // Move unit to destination battlefield
      zones.moveCard({
        cardId: unitId as CoreCardId,
        targetZoneId: toZone as CoreZoneId,
      });

      // rule 434.4 / 152.2 — attached Equipment is located with its holder.
      relocateAttachedEquipment(unitId as string, toZone, context.cards, zones);

      // Fire "move" game event so triggered abilities (e.g. Treasure
      // Hunter "When I move...") can react. Rule 616-619 covers
      // Discretionary moves — recalls do NOT fire this event and
      // Correctly live in recallUnit which omits this call.
      // rule-id: unl-133-219 — carry mover/owner so actor-scoped triggers match.
      fireTriggers(
        {
          batchIndex: moveBatchIndex++,
          cardId: unitId,
          from: fromZone,
          movedBy: playerId,
          owner: playerId,
          to: toZone,
          type: "move",
        },
        { cards: context.cards, counters, draft, zones },
      );
    }
    collapseTriggerBatch(draft.interaction, chainLenBeforeMoves);

    // Increment per-turn move counter for escalation tracking
    if (!draft.unitsMovedThisTurn) {
      draft.unitsMovedThisTurn = {};
    }
    draft.unitsMovedThisTurn[playerId] =
      (draft.unitsMovedThisTurn[playerId] ?? 0) + unitIds.length;

    // rule 190.3.a / 450 → 319.8 / 323.8: arriving where the mover has no
    // control applies Contested and STAGES the Showdown / Combat. Beginning it
    // is the Cleanup's step (323.12 / 323.13 / 344 / 460 — `moves/index.ts
    // withStagedShowdownOpening`), which needs a Neutral Open State: with the
    // mover's own "When I move" trigger on the chain (401.1) it stays Staged
    // until that chain has resolved. One helper for every kind of arrival:
    // operations/arrive-at-battlefield.ts.
    if (!toBase) {
      const io = { cards: context.cards, counters, draft, zones } as unknown as ArrivalIO;
      noteArrival(io, { at: destination, cause: "move", discretionary: true, stagedBy: playerId, unitIds });
    }
  },
};
