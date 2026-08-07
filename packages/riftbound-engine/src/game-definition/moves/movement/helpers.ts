/**
 * Movement helpers (split from movement.ts). Leaf module.
 */

import type {
  CardId as CoreCardId,
  PlayerId as CorePlayerId,
  ZoneId as CoreZoneId,
} from "@tcg/core";
import type { GrantedKeyword, RiftboundCardMeta, RiftboundGameState } from "../../../types";
import { getGlobalCardRegistry } from "../../../operations/card-lookup";

/**
 * Check if a card has a specific keyword, considering both the card
 * definition's keywords and any runtime-granted keywords on its meta.
 */
export function hasKeyword(
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
export function getMoveEscalationSurcharge(
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
 * rule 144.4.a.1 / 449.2 / 410.1.b.3 — a battlefield that already holds units
 * of TWO other players is not a legal destination for `playerId`'s unit by any
 * means (Standard Move, Ganking, or an effect-driven move). Only matters in
 * games with 3+ players.
 */
export function isBlockedByTwoOtherPlayers(
  battlefieldId: string,
  playerId: string,
  getCardsInZone: (zoneId: CoreZoneId) => readonly CoreCardId[],
  getController: (cardId: string) => string | undefined,
): boolean {
  const registry = getGlobalCardRegistry();
  const others = new Set<string>();
  const zoneId = (
    battlefieldId.startsWith("battlefield-") ? battlefieldId : `battlefield-${battlefieldId}`
  ) as CoreZoneId;
  for (const cardId of getCardsInZone(zoneId)) {
    if (registry.get(cardId as string)?.cardType !== "unit") {
      continue;
    }
    const controller = getController(cardId as string);
    if (controller !== undefined && controller !== playerId) {
      others.add(controller);
    }
  }
  return others.size >= 2;
}

/**
 * rule 740.2.a — a unit attacks or defends "alone" when no OTHER unit its
 * controller controls is at the same battlefield. `unitsAtLocation` is the
 * full occupancy of that battlefield after the move resolved.
 */
export function isAloneAtLocation(
  unitId: string,
  owner: string,
  unitsAtLocation: readonly string[],
  getOwner: (cardId: string) => string | undefined,
): boolean {
  return !unitsAtLocation.some((id) => id !== unitId && getOwner(id) === owner);
}
