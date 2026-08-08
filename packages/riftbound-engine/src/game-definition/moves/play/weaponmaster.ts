// rule-id: ven-041-166-weaponmaster-on-play-equip
// Weaponmaster (rule 821) is a `{type:"keyword"}` ability, so trigger-matcher
// never schedules it. Every path that PLAYS a unit — the playUnit move from
// hand and effects that instruct a play (rule 356.1.b, e.g. Arcane Shift
// re-playing a banished unit) — must surface the same "you may Equip … for
// [rainbow] less" prompt, so the offer lives here and is shared by both.
import type { CardId as CoreCardId, PlayerId as CorePlayerId, ZoneId as CoreZoneId } from "@tcg/core";
import { getGlobalCardRegistry } from "../../../operations/card-lookup";
import { getBattlefieldZoneId } from "../../../zones/zone-configs";

interface WeaponmasterDraft {
  battlefields?: Record<string, unknown>;
  pendingChoice?: unknown;
}

interface WeaponmasterZones {
  getCardsInZone(zoneId: CoreZoneId, playerId?: CorePlayerId): readonly unknown[];
}

interface WeaponmasterCards {
  getCardOwner?(cardId: CoreCardId): string | undefined;
  getCardController?(cardId: CoreCardId): string | undefined;
}

/**
 * Put the Weaponmaster equip prompt on `draft.pendingChoice` when the unit that
 * was just played has the keyword and its controller owns at least one piece of
 * Equipment on the board. The reduced Equip cost is charged by the
 * `weaponmaster-equip` reducer (rule 821.1.c).
 */
export function offerWeaponmasterEquip(
  draft: WeaponmasterDraft,
  zones: WeaponmasterZones,
  playerId: string,
  cardId: string,
  cards?: WeaponmasterCards,
): void {
  if (draft.pendingChoice) {
    return;
  }
  const registry = getGlobalCardRegistry();
  if (!registry.hasKeyword(cardId, "Weaponmaster")) {
    return;
  }
  const boardZones: string[] = ["base"];
  for (const bfId of Object.keys(draft.battlefields ?? {})) {
    boardZones.push(getBattlefieldZoneId(bfId));
  }
  const equipOptions: string[] = [];
  // rule 821.1.b/c — "an Equipment you CONTROL". `getCardsInZone(zone, player)`
  // filters by OWNER, so a control-changed Equipment (e.g. taken by
  // sfd-109-221 Akshan) would be missed and one we own but lost control of
  // would be wrongly offered. Filter by controller whenever we can read it.
  const canReadController = typeof cards?.getCardController === "function";
  for (const zoneId of boardZones) {
    for (const id of zones.getCardsInZone(
      zoneId as CoreZoneId,
      canReadController ? undefined : (playerId as CorePlayerId),
    )) {
      if (canReadController) {
        const controller =
          cards?.getCardController?.(id as CoreCardId) ?? cards?.getCardOwner?.(id as CoreCardId);
        if (controller !== playerId) {
          continue;
        }
      }
      // rule 208.3 / 476.1 (ven-027-166 Hand Hammer) — a gear with the printed
      // [Equip] ability IS Equipment. VEN cards come from set JSON typed simply
      // as "gear", so accept them the same way `equipCard` does instead of
      // gating on the "equipment" card type alone.
      const equipDef = registry.get(id as string);
      const isEquipment =
        equipDef?.cardType === "equipment" ||
        (equipDef?.cardType === "gear" && registry.hasKeyword(id as string, "Equip"));
      if (isEquipment) {
        equipOptions.push(id as string);
      }
    }
  }
  if (equipOptions.length === 0) {
    return;
  }
  draft.pendingChoice = {
    options: equipOptions,
    playerId,
    type: "weaponmaster-equip",
    unitId: cardId as unknown as CoreCardId,
  };
}
