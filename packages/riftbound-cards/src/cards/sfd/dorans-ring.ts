import type { EquipmentCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const doransRing: EquipmentCard = {
  cardNumber: 124,
  cardType: "equipment",
  domain: "chaos",
  effectText: "When I conquer, discard 1, then draw 1.",
  energyCost: 1,
  id: createCardId("sfd-124-221"),
  mightBonus: 1,
  name: "Doran's Ring",
  rarity: "common",
  rulesText:
    "[Equip] [chaos] ([chaos]: Attach this to a unit you control.)\nWhen I conquer, discard 1, then draw 1.",
  setId: "SFD",
};
