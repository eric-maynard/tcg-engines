import type { EquipmentCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const recurveBow: EquipmentCard = {
  cardNumber: 16,
  cardType: "equipment",
  domain: "fury",
  energyCost: 2,
  id: createCardId("sfd-016-221"),
  mightBonus: 0,
  name: "Recurve Bow",
  rarity: "uncommon",
  rulesText: "[Equip] [fury] ([fury]: Attach this to a unit you control.)",
  setId: "SFD",
};
