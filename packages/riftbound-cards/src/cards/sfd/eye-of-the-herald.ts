import type { EquipmentCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const eyeOfTheHerald: EquipmentCard = {
  cardNumber: 153,
  cardType: "equipment",
  domain: "order",
  energyCost: 1,
  id: createCardId("sfd-153-221"),
  mightBonus: 0,
  name: "Eye of the Herald",
  rarity: "common",
  rulesText: "[Equip] [order] ([order]: Attach this to a unit you control.)",
  setId: "SFD",
};
