/**
 * rule 107.3.b / 107.3.b.1 — how many cards a battlefield's Facedown Zone may
 * hold for its controller.
 *
 * The default is one. Battlefield text ("You may hide an additional card
 * here.") is baked into `hiddenCapacityBonus` at setup; a permanent's static
 * `increase-hidden-capacity` raises it live for every battlefield its
 * controller controls, for as long as that permanent is on the board.
 *
 * Shared by the Hide move (capacity check at hide time) and the state-based
 * checks (rule 107.3.b.2 — trim down when the maximum drops).
 */

import type { CardId as CoreCardId, PlayerId as CorePlayerId, ZoneId as CoreZoneId } from "@tcg/core";
import type { RiftboundGameState } from "../types";
import { getGlobalCardRegistry } from "./card-lookup";
import { getBattlefieldZoneId } from "../zones/zone-configs";

export interface HiddenCapacityContext {
  cards: {
    getCardController?: (id: CoreCardId) => string | undefined;
    getCardOwner: (id: CoreCardId) => string | undefined;
  };
  zones: {
    getCardsInZone: (zoneId: CoreZoneId, playerId?: CorePlayerId) => readonly CoreCardId[];
  };
}

export function hiddenCapacityAt(
  state: RiftboundGameState,
  playerId: string,
  bfId: string,
  ctx: HiddenCapacityContext,
): number {
  const bf = state.battlefields[bfId];
  let capacity = 1 + (bf?.hiddenCapacityBonus ?? 0);
  const registry = getGlobalCardRegistry();
  const controllerOf = (id: CoreCardId) =>
    ctx.cards.getCardController?.(id) ?? ctx.cards.getCardOwner(id);
  const candidates: CoreCardId[] = [
    ...ctx.zones.getCardsInZone("base" as CoreZoneId, playerId as CorePlayerId),
  ];
  for (const otherBfId of Object.keys(state.battlefields)) {
    candidates.push(...ctx.zones.getCardsInZone(getBattlefieldZoneId(otherBfId) as CoreZoneId));
  }
  for (const id of candidates) {
    if (controllerOf(id) !== playerId) {
      continue;
    }
    for (const ability of registry.getAbilities(id as string) ?? []) {
      if (ability.type !== "static") {
        continue;
      }
      const effect = ability.effect as { type?: string; amount?: number } | undefined;
      if (effect?.type === "increase-hidden-capacity") {
        capacity += effect.amount ?? 1;
      }
    }
  }
  return capacity;
}
