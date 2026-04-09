import type { EquipmentCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const worldAtlas: EquipmentCard = {
  cardNumber: 86,
  cardType: "equipment",
  domain: "mind",
  energyCost: 3,
  id: createCardId("sfd-086-221"),
  mightBonus: 2,
  name: "World Atlas",
  rarity: "rare",
  rulesText: "[Equip] [mind] ([mind]: Attach this to a unit you control.)",
  setId: "SFD",
};
