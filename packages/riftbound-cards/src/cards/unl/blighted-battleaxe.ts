import type { EquipmentCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const blightedBattleaxe: EquipmentCard = {
  cardNumber: 19,
  cardType: "equipment",
  domain: "fury",
  energyCost: 4,
  id: createCardId("unl-019-219"),
  mightBonus: 4,
  name: "Blighted Battleaxe",
  rarity: "rare",
  rulesText: "[Equip] [1][fury] ([1][fury]: Attach this to a unit you control.)",
  setId: "UNL",
};
