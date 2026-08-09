import type { EquipmentCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const recurveBow: EquipmentCard = {
  cardNumber: 16,
  cardType: "equipment",
  domain: "fury",
  effectText: "When I attack or defend, deal 2 to an enemy unit here.",
  energyCost: 2,
  id: createCardId("sfd-016-221"),
  mightBonus: 0,
  name: "Recurve Bow",
  rarity: "uncommon",
  rulesText:
    "[Equip] [fury] ([fury]: Attach this to a unit you control.)\nWhen I attack or defend, deal 2 to an enemy unit here.",
  setId: "SFD",
};
