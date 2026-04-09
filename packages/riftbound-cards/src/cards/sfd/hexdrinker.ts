import type { EquipmentCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const hexdrinker: EquipmentCard = {
  cardNumber: 102,
  cardType: "equipment",
  domain: "body",
  energyCost: 2,
  id: createCardId("sfd-102-221"),
  mightBonus: 1,
  name: "Hexdrinker",
  rarity: "uncommon",
  rulesText: "[Equip] [body] ([body]: Attach this to a unit you control.)",
  setId: "SFD",
};
