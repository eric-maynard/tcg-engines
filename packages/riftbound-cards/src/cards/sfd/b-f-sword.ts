import type { EquipmentCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const bFSword: EquipmentCard = {
  cardNumber: 161,
  cardType: "equipment",
  domain: "order",
  energyCost: 4,
  id: createCardId("sfd-161-221"),
  mightBonus: 3,
  name: "B.F. Sword",
  rarity: "uncommon",
  rulesText: "[Equip] [order] ([order]: Attach this to a unit you control.)",
  setId: "SFD",
};
