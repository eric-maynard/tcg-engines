import type { EquipmentCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const guardianAngel: EquipmentCard = {
  cardNumber: 51,
  cardType: "equipment",
  domain: "calm",
  energyCost: 2,
  id: createCardId("sfd-051-221"),
  mightBonus: 1,
  name: "Guardian Angel",
  rarity: "rare",
  rulesText: "[Equip] [calm] ([calm]: Attach this to a unit you control.)",
  setId: "SFD",
};
