/**
 * Printed [Equip] cost lookup and payability (rule 476.1).
 *
 * [Equip] is an activated ability printed on an Equipment: "[N]: Attach this to
 * a unit you control." Both the player-facing attach move and the Weaponmaster
 * on-play attach read the cost from here so the two paths cannot drift.
 */
import { getGlobalCardRegistry } from "../../operations/card-lookup";
import type { RiftboundGameState } from "../../types";
import { canAffordPower } from "./chain/effect-context";

export interface EquipCost {
  readonly energy: number;
  readonly power: readonly string[];
  /**
   * rule 821.1.c.5 / 476.1 (sfd-150-221 Last Rites) — "[Equip] — [chaos],
   * Recycle 2 cards from your trash": a non-resource portion of the Equip
   * cost. Nothing discounts it, and it is unpayable with too few cards in the
   * trash.
   */
  readonly recycleFromTrash?: number;
}

/** Cards currently in `playerId`'s trash, when the zone bag is available. */
export function trashSize(
  // biome-ignore lint/suspicious/noExplicitAny: move context bag is framework-typed
  zones: any,
  playerId: string,
): number {
  if (typeof zones?.getCardsInZone !== "function") {
    return 0;
  }
  return zones.getCardsInZone("trash", playerId).length as number;
}

/**
 * rule 476.1: the printed [Equip] cost of a card, unreduced.
 * `undefined` means the card prints no [Equip] ability at all.
 */
export function printedEquipCost(equipmentId: string): EquipCost | undefined {
  const abilities = getGlobalCardRegistry().getAbilities(equipmentId) ?? [];
  const equipAbility = abilities.find(
    (a) => a.type === "keyword" && (a as { keyword?: string }).keyword === "Equip",
  ) as
    | { cost?: { energy?: number; power?: readonly string[]; recycle?: number } }
    | undefined;
  if (!equipAbility) {
    return undefined;
  }
  const recycle = equipAbility.cost?.recycle;
  return {
    energy: equipAbility.cost?.energy ?? 0,
    power: [...(equipAbility.cost?.power ?? [])],
    ...(typeof recycle === "number" && recycle > 0 ? { recycleFromTrash: recycle } : {}),
  };
}

/**
 * rule 403.1.a / 404.1: whether `playerId` can pay the given Equip cost right
 * now. Ready runes count toward energy (357.1.a) exactly as the deduction path
 * spends them.
 */
export function canPayEquipCost(
  state: RiftboundGameState,
  playerId: string,
  cost: EquipCost,
  readyRunes = 0,
  // biome-ignore lint/suspicious/noExplicitAny: move context bag is framework-typed
  zones?: any,
): boolean {
  // rule 476.1 / 821.1.c.5 (sfd-150-221): the Recycle portion of an Equip cost
  // is unpayable when the trash holds fewer cards than it demands.
  if (cost.recycleFromTrash !== undefined && zones !== undefined) {
    if (trashSize(zones, playerId) < cost.recycleFromTrash) {
      return false;
    }
  }
  const pool = state.runePools[playerId];
  if (!pool) {
    return false;
  }
  if (pool.energy + readyRunes < cost.energy) {
    return false;
  }
  if (cost.power.length > 0) {
    const needed: Record<string, number> = {};
    for (const d of cost.power) {
      needed[d] = (needed[d] ?? 0) + 1;
    }
    if (!canAffordPower(pool.power, needed)) {
      return false;
    }
  }
  return true;
}
