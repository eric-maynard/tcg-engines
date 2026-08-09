import type { EquipmentCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const doransShield: EquipmentCard = {
  cardNumber: 33,
  cardType: "equipment",
  domain: "calm",
  effectText: "[Tank] (I must be assigned combat damage first.)",
  energyCost: 1,
  id: createCardId("sfd-033-221"),
  mightBonus: 1,
  name: "Doran's Shield",
  rarity: "common",
  rulesText:
    "[Equip] [calm] ([calm]: Attach this to a unit you control.)\n[Tank] (I must be assigned combat damage first.)",
  setId: "SFD",
};
