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
import { getMoveEscalationSurcharge, isAloneAtLocation } from "./helpers";

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
    for (const unitId of unitIds) {
      const zone = context.zones.getCardZone(unitId as CoreCardId) as string | undefined;
      // Rule 144.4.b: base → battlefield, or battlefield → base.
      if (toBase) {
        if (!zone?.startsWith("battlefield-")) {
          return false;
        }
      } else if (zone !== "base") {
        return false;
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

      readyUnits.push(cardId as string);
    }

    // Rule 144.3: a Standard Move may move multiple units together to the
    // same destination as one action. Enumerate every non-empty subset of
    // ready base units per battlefield so the group move is offered.
    const subsets: string[][] = [];
    for (let mask = 1; mask < 1 << readyUnits.length; mask++) {
      const subset: string[] = [];
      for (let i = 0; i < readyUnits.length; i++) {
        if (mask & (1 << i)) {
          subset.push(readyUnits[i]);
        }
      }
      subsets.push(subset);
    }

    for (const bfId of Object.keys(state.battlefields || {})) {
      for (const unitIds of subsets) {
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
      const hasOpponentUnit = allUnits.some((cardId) => {
        const owner = context.cards.getCardOwner(cardId);
        return owner !== undefined && (owner as string) !== playerId;
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
        const ownerOf = (id: string) => context.cards.getCardOwner(id as CoreCardId) as string | undefined;
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
        for (const cardId of allUnits) {
          const owner = context.cards.getCardOwner(cardId);
          if (owner !== undefined && (owner as string) !== playerId) {
            context.cards.updateCardMeta(
              cardId,
              { combatRole: "defender" } as Partial<RiftboundCardMeta>,
            );
            fireTriggers(
              {
                alone: isAloneAtLocation(cardId as string, owner as string, occupants, ownerOf),
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
