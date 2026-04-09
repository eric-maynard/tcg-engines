import type { EquipmentCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const sacredShears: EquipmentCard = {
  cardNumber: 172,
  cardType: "equipment",
  domain: "order",
  energyCost: 2,
  id: createCardId("sfd-172-221"),
  mightBonus: 1,
  name: "Sacred Shears",
  rarity: "rare",
  rulesText: "[Equip] [order] ([order]: Attach this to a unit you control.)",
  setId: "SFD",
};
