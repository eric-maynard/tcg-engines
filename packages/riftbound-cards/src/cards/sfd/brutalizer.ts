import type { EquipmentCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const brutalizer: EquipmentCard = {
  cardNumber: 42,
  cardType: "equipment",
  domain: "calm",
  energyCost: 2,
  id: createCardId("sfd-042-221"),
  mightBonus: 1,
  name: "Brutalizer",
  rarity: "uncommon",
  rulesText: "[Equip] [calm] ([calm]: Attach this to a unit you control.)",
  setId: "SFD",
};
