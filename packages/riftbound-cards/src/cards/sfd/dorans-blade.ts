import type { EquipmentCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const doransBlade: EquipmentCard = {
  cardNumber: 95,
  cardType: "equipment",
  domain: "body",
  energyCost: 2,
  id: createCardId("sfd-095-221"),
  mightBonus: 2,
  name: "Doran's Blade",
  rarity: "common",
  rulesText: "[Equip] [body] ([body]: Attach this to a unit you control.)",
  setId: "SFD",
};
