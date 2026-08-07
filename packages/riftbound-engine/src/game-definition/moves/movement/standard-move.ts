/**
 * standardMove move (split from movement.ts).
 */

import type {
  CardId as CoreCardId,
  PlayerId as CorePlayerId,
  ZoneId as CoreZoneId,
  GameMoveDefinitions,
} from "@tcg/core";
import {
  createInteractionState,
  getTurnState,
  startShowdown as startShowdownState,
} from "../../../chain";
import type { RiftboundCardMeta, RiftboundGameState, RiftboundMoves } from "../../../types";
import { getGlobalCardRegistry } from "../../../operations/card-lookup";
import { fireTriggers } from "../../../abilities/trigger-runner";
import {
  getMoveEscalationSurcharge,
  hasKeyword,
  isAloneAtLocation,
  isBlockedByTwoOtherPlayers,
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
    if (
      !toBase &&
      isBlockedByTwoOtherPlayers(
        destination,
        playerId,
        (zoneId) => context.zones.getCardsInZone(zoneId),
        (cardId) => controllerOf(context.cards, cardId as CoreCardId),
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
          !hasKeyword(
            unitId,
            "Ganking",
            (id: CoreCardId) => context.cards.getCardMeta(id) as Partial<RiftboundCardMeta> | undefined,
          )
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

    // Rule: enemy move-escalation cards (e.g., Mageseeker Investigator)
    // Charge the active player 1 rainbow per unit moved beyond the first
    // In a single turn. Refuse the move if the pool can't cover it.
    const surcharge = getMoveEscalationSurcharge(
      state,
      playerId,
      unitIds.length,
      (c) => context.zones.getCardZone(c) as string | undefined,
      (c) => context.cards.getCardOwner(c) as string | undefined,
      (z, p) => context.zones.getCardsInZone(z, p),
    );
    if (surcharge > 0) {
      const pool = state.runePools[playerId];
      if (!pool || pool.energy < surcharge) {
        return false;
      }
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
      if (
        isBlockedByTwoOtherPlayers(
          bfId,
          context.playerId as string,
          (zoneId) => context.zones.getCardsInZone(zoneId),
          (cardId) => controllerOf(context.cards, cardId as CoreCardId),
        )
      ) {
        continue;
      }
      const gankers: string[] = [];
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
          if (!hasKeyword(cardId as string, "Ganking", metaAccessor)) {
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

    // Pay the move-escalation surcharge (rule: Mageseeker Investigator)
    const surcharge = getMoveEscalationSurcharge(
      draft,
      playerId,
      unitIds.length,
      (c) => context.zones.getCardZone(c) as string | undefined,
      (c) => context.cards.getCardOwner(c) as string | undefined,
      (z, p) => context.zones.getCardsInZone(z, p),
    );
    if (surcharge > 0) {
      const pool = draft.runePools[playerId];
      if (pool) {
        pool.energy = Math.max(0, pool.energy - surcharge);
      }
    }

    const toBase = destination === "base";
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

      // Fire "move" game event so triggered abilities (e.g. Treasure
      // Hunter "When I move...") can react. Rule 616-619 covers
      // Discretionary moves — recalls do NOT fire this event and
      // Correctly live in recallUnit which omits this call.
      // rule-id: unl-133-219 — carry mover/owner so actor-scoped triggers match.
      fireTriggers(
        { cardId: unitId, from: fromZone, movedBy: playerId, owner: playerId, to: toZone, type: "move" },
        { cards: context.cards, counters, draft, zones },
      );
    }

    // Increment per-turn move counter for escalation tracking
    if (!draft.unitsMovedThisTurn) {
      draft.unitsMovedThisTurn = {};
    }
    draft.unitsMovedThisTurn[playerId] =
      (draft.unitsMovedThisTurn[playerId] ?? 0) + unitIds.length;

    // Rule 548.2: When units arrive at an uncontrolled battlefield,
    // Start a non-combat showdown to give the opponent a window to respond
    const bf = toBase ? undefined : draft.battlefields[destination];
    if (bf && bf.controller !== playerId) {
      // Check if there are only friendly units (no opposing units)
      const bfZoneId = `battlefield-${destination}` as CoreZoneId;
      const allUnits = zones.getCardsInZone(bfZoneId);
      // rule 127.1 — "opposing" follows the CURRENT controller, not the owner:
      // a unit stolen by the mover is friendly, and a unit stolen FROM the mover
      // is hostile even though they still own it.
      const hasOpponentUnit = allUnits.some((cardId) => {
        const owner = controllerOf(context.cards, cardId);
        return owner !== undefined && owner !== playerId;
      });

      // Rule 450: the destination becomes Contested when it is an
      // Uncontested Battlefield not controlled by the mover — always,
      // whether or not opposing units are present (190.3.a).
      if (!bf.contested) {
        bf.contested = true;
        bf.contestedBy = playerId;
        bf.showdownComplete = false;
      }

      // Rules 319.8 → 323.13 / 344: Cleanup after the Move initiates the
      // Showdown mandatorily — no other discretionary action may intervene
      // (320.1). Open it here so the neutral-open guards on every other
      // move enforce that.
      const playerIds = Object.keys(draft.players);
      const defender = bf.controller ?? playerIds.find((p) => p !== playerId) ?? playerId;
      const interaction = draft.interaction ?? createInteractionState();
      draft.interaction = startShowdownState(
        interaction,
        destination,
        playerId,
        hasOpponentUnit ? [...new Set([playerId, defender])] : playerIds,
        hasOpponentUnit, // combat showdown iff opposing units present
        playerId,
        defender,
      );

      // rule-id: unl-079-219 (Rule 340 / 548.2): "When a showdown begins
      // here" fires for BOTH combat and non-combat showdowns.
      fireTriggers(
        { battlefieldId: destination, isCombat: hasOpponentUnit, playerId, type: "showdown-begin" },
        { cards: context.cards, counters, draft, zones },
      );

      // Rule 625.1.c.1 / 625.1.c.2 (sfd-177-221): opening a Combat
      // Showdown assigns combat roles and fires "attack" / "defend" so
      // "When I attack/defend" triggers land on the initial chain.
      if (hasOpponentUnit) {
        const triggerCtx = { cards: context.cards, counters, draft, zones };
        // rule 740.2.a — "alone" is judged against the battlefield's occupancy.
        const ownerOf = (id: string) => controllerOf(context.cards, id as CoreCardId);
        const occupants = allUnits as unknown as string[];
        for (const unitId of unitIds) {
          context.cards.updateCardMeta(
            unitId as CoreCardId,
            { combatRole: "attacker" } as Partial<RiftboundCardMeta>,
          );
          fireTriggers(
            {
              alone: isAloneAtLocation(unitId, playerId, occupants, ownerOf),
              battlefieldId: destination,
              cardId: unitId,
              owner: playerId,
              type: "attack",
            },
            triggerCtx,
          );
        }
        // rule 383.4.f.2.a — index each player's defenders so "when YOU
        // defend" fires once per combat while "when I defend" still fires per unit.
        const defendCount = new Map<string, number>();
        for (const cardId of allUnits) {
          const owner = controllerOf(context.cards, cardId);
          if (owner !== undefined && owner !== playerId) {
            context.cards.updateCardMeta(
              cardId,
              { combatRole: "defender" } as Partial<RiftboundCardMeta>,
            );
            const batchIndex = defendCount.get(owner as string) ?? 0;
            defendCount.set(owner as string, batchIndex + 1);
            fireTriggers(
              {
                alone: isAloneAtLocation(cardId as string, owner as string, occupants, ownerOf),
                batchIndex,
                battlefieldId: destination,
                cardId: cardId as string,
                owner: owner as string,
                type: "defend",
              },
              triggerCtx,
            );
          }
        }
      }
    }
  },
};
