import type { EquipmentCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const svellsongur: EquipmentCard = {
  cardNumber: 59,
  cardType: "equipment",
  domain: "calm",
  energyCost: 3,
  id: createCardId("sfd-059-221"),
  mightBonus: 0,
  name: "Svellsongur",
  rarity: "epic",
  rulesText:
    "[Equip] [1][calm] ([1][calm]: Attach this to a unit you control.)\nAs this is attached to a unit, copy that unit's text to this Equipment's effect text for as long as this is attached to it.",
  setId: "SFD",
};
