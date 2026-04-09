import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const beastBelow: UnitCard = {
  cardNumber: 132,
  cardType: "unit",
  domain: "chaos",
  energyCost: 7,
  id: createCardId("sfd-132-221"),
  might: 8,
  name: "Beast Below",
  rarity: "uncommon",
  rulesText:
    "When you play me, return another friendly unit and an enemy unit to their owners' hands.",
  setId: "SFD",
};
