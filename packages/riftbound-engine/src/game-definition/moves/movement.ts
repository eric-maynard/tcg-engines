/**
 * Riftbound Movement Moves
 *
 * Moves for unit movement: standard move, ganking, and recalls.
 */

import type {
  CardId as CoreCardId,
  PlayerId as CorePlayerId,
  ZoneId as CoreZoneId,
  GameMoveDefinitions,
} from "@tcg/core";
import { createInteractionState, startShowdown as startShowdownState } from "../../chain";
import type {
  GrantedKeyword,
  RiftboundCardMeta,
  RiftboundGameState,
  RiftboundMoves,
} from "../../types";
import { getGlobalCardRegistry } from "../../operations/card-lookup";
import { fireTriggers } from "../../abilities/trigger-runner";

/**
 * Check if a card has a specific keyword, considering both the card
 * definition's keywords and any runtime-granted keywords on its meta.
 */
function hasKeyword(
  cardId: string,
  keyword: string,
  getCardMeta?: (cardId: CoreCardId) => Partial<RiftboundCardMeta> | undefined,
): boolean {
  const registry = getGlobalCardRegistry();
  if (registry.hasKeyword(cardId, keyword)) {
    return true;
  }
  // Check granted keywords from card meta
  if (getCardMeta) {
    const meta = getCardMeta(cardId as CoreCardId);
    const granted = meta?.grantedKeywords as GrantedKeyword[] | undefined;
    if (granted?.some((gk) => gk.keyword === keyword)) {
      return true;
    }
  }
  return false;
}

/**
 * Compute the total move-escalation surcharge imposed on `playerId` by
 * enemy-controlled board cards that declare `moveEscalation`.
 *
 * For the Nth unit moved in a single turn (N > 1), the active player pays
 * 1 extra energy per escalator on the board. We only require one such
 * escalator to be present (Mageseeker Investigator is unique); multiple
 * escalators do not stack.
 *
 * Returns 0 if no enemy escalator exists on the board.
 */
function getMoveEscalationSurcharge(
  state: RiftboundGameState,
  playerId: string,
  unitsToMove: number,
  getCardZone: (cardId: CoreCardId) => string | undefined,
  getCardOwner: (cardId: CoreCardId) => string | undefined,
  getCardsInZone: (zoneId: CoreZoneId, playerId?: CorePlayerId) => CoreCardId[],
): number {
  const registry = getGlobalCardRegistry();

  let hasEscalation = false;

  // Check enemy base cards
  for (const otherId of Object.keys(state.players)) {
    if (otherId === playerId) {
      continue;
    }
    const baseCards = getCardsInZone("base" as CoreZoneId, otherId as CorePlayerId);
    for (const cid of baseCards) {
      if (registry.hasMoveEscalation(cid as string)) {
        hasEscalation = true;
        break;
      }
    }
    if (hasEscalation) {
      break;
    }
  }

  // Check enemy battlefield cards
  if (!hasEscalation) {
    for (const bfId of Object.keys(state.battlefields ?? {})) {
      const bfCards = getCardsInZone(`battlefield-${bfId}` as CoreZoneId);
      for (const cid of bfCards) {
        const owner = getCardOwner(cid);
        if (owner && owner !== playerId && registry.hasMoveEscalation(cid as string)) {
          hasEscalation = true;
          break;
        }
      }
      if (hasEscalation) {
        break;
      }
    }
  }

  if (!hasEscalation) {
    return 0;
  }

  const alreadyMoved = state.unitsMovedThisTurn?.[playerId] ?? 0;
  let surcharge = 0;
  for (let i = 0; i < unitsToMove; i++) {
    const ordinal = alreadyMoved + i + 1;
    if (ordinal > 1) {
      surcharge += 1;
    }
  }
  return surcharge;
}

/**
 * Movement move definitions
 */
export const movementMoves: Partial<
  GameMoveDefinitions<RiftboundGameState, RiftboundMoves, RiftboundCardMeta, unknown>
> = {
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
  standardMove: {
    condition: (state, context) => {
      if (state.status !== "playing") {
        return false;
      }
      if (state.turn.activePlayer !== context.params.playerId) {
        return false;
      }
      if (state.turn.phase !== "main") {
        return false;
      }

      const { unitIds, playerId } = context.params;
      for (const unitId of unitIds) {
        const zone = context.zones.getCardZone(unitId as CoreCardId);
        if (zone !== "base") {
          return false;
        }

        const owner = context.cards.getCardOwner(unitId as CoreCardId);
        if ((owner as string) !== playerId) {
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
      if (state.status !== "playing") {
        return [];
      }
      if (state.turn.activePlayer !== (context.playerId as string)) {
        return [];
      }
      if (state.turn.phase !== "main") {
        return [];
      }

      const registry = getGlobalCardRegistry();
      const baseCards = context.zones.getCardsInZone(
        "base" as CoreZoneId,
        context.playerId as CorePlayerId,
      );

      const results: {
        playerId: string;
        unitIds: string[];
        destination: string;
      }[] = [];

      for (const cardId of baseCards) {
        const owner = context.cards.getCardOwner(cardId);
        if ((owner as string) !== (context.playerId as string)) {
          continue;
        }

        const def = registry.get(cardId as string);
        if (def?.cardType !== "unit") {
          continue;
        }

        if (context.counters.getFlag(cardId, "exhausted")) {
          continue;
        }

        for (const bfId of Object.keys(state.battlefields || {})) {
          results.push({
            destination: bfId,
            playerId: context.playerId as string,
            unitIds: [cardId as string],
          });
        }
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

      for (const unitId of unitIds) {
        // Capture the source zone before the move so the fired event
        // Reports accurate from/to locations.
        const fromZone =
          (context.zones.getCardZone(unitId as CoreCardId) as string | undefined) ?? "base";
        const toZone = `battlefield-${destination}`;

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
        fireTriggers(
          { cardId: unitId, from: fromZone, to: toZone, type: "move" },
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
      const bf = draft.battlefields[destination];
      if (bf && bf.controller !== playerId) {
        // Check if there are only friendly units (no opposing units)
        const bfZoneId = `battlefield-${destination}` as CoreZoneId;
        const allUnits = zones.getCardsInZone(bfZoneId);
        const hasOpponentUnit = allUnits.some((cardId) => {
          const owner = context.cards.getCardOwner(cardId);
          return owner !== undefined && (owner as string) !== playerId;
        });

        if (!hasOpponentUnit && allUnits.length > 0) {
          // Start a non-combat showdown before conquer can proceed
          const playerIds = Object.keys(draft.players);
          const opponent = playerIds.find((p) => p !== playerId) ?? playerId;
          const relevantPlayers = [playerId, opponent];

          const interaction = draft.interaction ?? createInteractionState();
          draft.interaction = startShowdownState(
            interaction,
            destination,
            playerId,
            relevantPlayers,
            false, // Not a combat showdown
            playerId,
            opponent,
          );
        }
      }
    },
  },

  /**
   * Ganking Move
   *
   * Move a unit from one Battlefield to another.
   * Requires the Ganking keyword.
   * The unit is exhausted as part of the move.
   */
  gankingMove: {
    condition: (state, context) => {
      if (state.status !== "playing") {
        return false;
      }
      if (state.turn.activePlayer !== context.params.playerId) {
        return false;
      }
      if (state.turn.phase !== "main") {
        return false;
      }

      const zone = context.zones.getCardZone(context.params.unitId as CoreCardId);
      if (!zone || !(zone as string).startsWith("battlefield-")) {
        return false;
      }

      const owner = context.cards.getCardOwner(context.params.unitId as CoreCardId);
      if ((owner as string) !== context.params.playerId) {
        return false;
      }

      if (context.counters.getFlag(context.params.unitId as CoreCardId, "exhausted")) {
        return false;
      }

      // Rule 722: Only units with the Ganking keyword can move battlefield-to-battlefield
      const metaAccessor = (id: CoreCardId) =>
        context.cards.getCardMeta(id) as Partial<RiftboundCardMeta> | undefined;
      if (!hasKeyword(context.params.unitId, "Ganking", metaAccessor)) {
        return false;
      }

      return true;
    },
    enumerator: (state, context) => {
      if (state.status !== "playing") {
        return [];
      }
      if (state.turn.activePlayer !== (context.playerId as string)) {
        return [];
      }
      if (state.turn.phase !== "main") {
        return [];
      }

      const results: {
        playerId: string;
        unitId: string;
        toBattlefield: string;
      }[] = [];

      for (const bfId of Object.keys(state.battlefields || {})) {
        const bfZoneId = `battlefield-${bfId}` as CoreZoneId;
        const cardsAtBf = context.zones.getCardsInZone(bfZoneId);

        const metaAccessor = (id: CoreCardId) =>
          context.cards.getCardMeta(id) as Partial<RiftboundCardMeta> | undefined;

        for (const cardId of cardsAtBf) {
          const owner = context.cards.getCardOwner(cardId);
          if ((owner as string) !== (context.playerId as string)) {
            continue;
          }
          if (context.counters.getFlag(cardId, "exhausted")) {
            continue;
          }

          // Rule 722: Only units with the Ganking keyword can move battlefield-to-battlefield
          if (!hasKeyword(cardId as string, "Ganking", metaAccessor)) {
            continue;
          }

          // Can gank to any OTHER battlefield
          for (const otherBfId of Object.keys(state.battlefields || {})) {
            if (otherBfId === bfId) {
              continue;
            }
            results.push({
              playerId: context.playerId as string,
              toBattlefield: otherBfId,
              unitId: cardId as string,
            });
          }
        }
      }
      return results;
    },
    reducer: (draft, context) => {
      const { unitId, toBattlefield } = context.params;
      const { zones, counters } = context;

      // Capture source zone before moving so the fired move event
      // Reports accurate from/to locations.
      const fromZone =
        (context.zones.getCardZone(unitId as CoreCardId) as string | undefined) ?? "";
      const toZone = `battlefield-${toBattlefield}`;

      // Exhaust the unit
      counters.setFlag(unitId as CoreCardId, "exhausted", true);

      // Move unit to the target battlefield
      zones.moveCard({
        cardId: unitId as CoreCardId,
        targetZoneId: toZone as CoreZoneId,
      });

      // Fire "move" game event for triggered abilities that react to
      // Battlefield-to-battlefield Ganking moves.
      fireTriggers(
        { cardId: unitId, from: fromZone, to: toZone, type: "move" },
        { cards: context.cards, counters, draft, zones },
      );
    },
  },

  /**
   * Recall Unit
   *
   * Return a unit to its owner's Base.
   * This is NOT a Move (doesn't trigger move abilities).
   *
   * Per rules 616-619: Recalls are NOT discretionary player actions.
   * They occur only as consequences of game effects:
   *   - Combat resolution (rule 627.2: attackers recalled when both sides survive)
   *   - Cleanup (corrective recalls for illegal positions)
   *   - Card abilities (e.g., "recall a unit")
   *
   * The condition and enumerator always return false/empty to prevent
   * this from appearing as an available player move. The reducer is
   * retained for engine-internal use when effects trigger recalls.
   */
  recallUnit: {
    condition: () => false,
    enumerator: () => [],
    reducer: (_draft, context) => {
      const { unitId } = context.params;
      const { zones } = context;

      // Move unit back to base
      // Note: This uses moveCard but represents a Recall, not a Move
      zones.moveCard({
        cardId: unitId as CoreCardId,
        targetZoneId: "base" as CoreZoneId,
      });
    },
  },

  /**
   * Recall Gear
   *
   * Return gear to its owner's Base.
   * Gear at a Battlefield is Recalled to Base during Cleanup.
   */
  recallGear: {
    reducer: (_draft, context) => {
      const { gearId } = context.params;
      const { zones } = context;

      // Move gear back to base
      zones.moveCard({
        cardId: gearId as CoreCardId,
        targetZoneId: "base" as CoreZoneId,
      });
    },
  },
};
