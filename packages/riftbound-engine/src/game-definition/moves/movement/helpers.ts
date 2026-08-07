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
 * rule 204.4 (unl-163-219 Mageseeker Investigator) — an "applied cost" attached
 * to a Standard Move: moving MULTIPLE units AT THE SAME TIME to the battlefield
 * where an enemy `moveEscalation` card sits costs [rainbow] for each unit beyond
 * the first in THAT move.
 *
 * rule 445–447: separate single-unit moves in the same turn are separate
 * actions and are never taxed — the surcharge is per move action, not per turn.
 * rule 106: "my battlefield" is the battlefield the escalator is currently at;
 * an escalator in base (or at another battlefield) taxes nothing.
 *
 * The currency is POWER of any domain (rule 135.2.e.5.a), never energy — see
 * `payMoveEscalationSurcharge`.
 *
 * Returns the number of [rainbow] pips owed for THIS move action.
 */
export function getMoveEscalationSurcharge(
  _state: RiftboundGameState,
  playerId: string,
  unitsToMove: number,
  destination: string,
  getCardOwner: (cardId: CoreCardId) => string | undefined,
  getCardsInZone: (zoneId: CoreZoneId, playerId?: CorePlayerId) => CoreCardId[],
): number {
  if (destination === "base" || unitsToMove < 2) {
    return 0;
  }
  const registry = getGlobalCardRegistry();
  const zoneId = (
    destination.startsWith("battlefield-") ? destination : `battlefield-${destination}`
  ) as CoreZoneId;
  for (const cid of getCardsInZone(zoneId)) {
    const owner = getCardOwner(cid);
    if (owner !== undefined && owner !== playerId && registry.hasMoveEscalation(cid as string)) {
      return unitsToMove - 1;
    }
  }
  return 0;
}

/**
 * rule 135.2.e.5.a — total POWER of any domain available to pay [rainbow] pips.
 */
export function totalPowerAvailable(state: RiftboundGameState, playerId: string): number {
  const pool = state.runePools[playerId];
  if (!pool) {
    return 0;
  }
  return Object.values(pool.power ?? {}).reduce((sum, n) => sum + (n ?? 0), 0);
}

/**
 * Pay `amount` [rainbow] pips out of `playerId`'s POWER (any domain, rule
 * 135.2.e.5.a). Energy is never touched. Returns false — leaving the pool
 * untouched — when the cost cannot be paid (rule 203 makes the action illegal).
 */
export function payMoveEscalationSurcharge(
  draft: RiftboundGameState,
  playerId: string,
  amount: number,
): boolean {
  if (amount <= 0) {
    return true;
  }
  const pool = draft.runePools[playerId];
  if (!pool || totalPowerAvailable(draft, playerId) < amount) {
    return false;
  }
  let remaining = amount;
  for (const domain of Object.keys(pool.power ?? {})) {
    if (remaining <= 0) {
      break;
    }
    const have = pool.power[domain] ?? 0;
    const take = Math.min(have, remaining);
    pool.power[domain] = have - take;
    remaining -= take;
  }
  return remaining === 0;
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

/**
 * rule 434.4 / 152.2 — an Equipment is located wherever the unit it is
 * attached to is located, so every move of the holder drags its attachments
 * along. Cleanup only recalls LOOSE gear (state-based-checks step 5 skips
 * equipment whose host is still on the board), so the relocation has to happen
 * at each move site.
 */
export function relocateAttachedEquipment(
  unitId: string,
  toZone: string,
  cards: { getCardMeta?: (cardId: CoreCardId) => Partial<RiftboundCardMeta> | undefined },
  zones: {
    getCardZone: (cardId: CoreCardId) => string | undefined;
    moveCard: (args: { cardId: CoreCardId; targetZoneId: CoreZoneId }) => unknown;
  },
): void {
  const equipped = cards.getCardMeta?.(unitId as CoreCardId)?.equippedWith ?? [];
  for (const equipId of equipped) {
    const from = zones.getCardZone(equipId as CoreCardId) as string | undefined;
    // Only board-resident attachments travel; one in a trash/hand is already gone.
    if (from === undefined || from === toZone) {
      continue;
    }
    if (from !== "base" && !from.startsWith("battlefield-")) {
      continue;
    }
    zones.moveCard({ cardId: equipId as CoreCardId, targetZoneId: toZone as CoreZoneId });
  }
}

/**
 * rule 187.9 / unl-t01 (Baron Pit): "Units can move here from anywhere" is a
 * property of the DESTINATION battlefield — it lifts the 144.4.b
 * base↔battlefield restriction for moves TO it only, never for moves away.
 */
export function battlefieldAcceptsMoveFromAnywhere(battlefieldId: string): boolean {
  const id = battlefieldId.startsWith("battlefield-")
    ? battlefieldId.slice("battlefield-".length)
    : battlefieldId;
  const registry = getGlobalCardRegistry();
  if (registry.hasKeyword(id, "AcceptsMoveFromAnywhere")) {
    return true;
  }
  const abilities = (registry.getAbilities(id) ?? []) as {
    effect?: { type?: string; keyword?: string };
  }[];
  return abilities.some(
    (ability) =>
      ability.effect?.type === "grant-keyword" &&
      ability.effect?.keyword === "AcceptsMoveFromAnywhere",
  );
}
