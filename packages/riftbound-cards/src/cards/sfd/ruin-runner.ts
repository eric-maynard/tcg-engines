import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const ruinRunner: UnitCard = {
  cardNumber: 105,
  cardType: "unit",
  domain: "body",
  energyCost: 6,
  id: createCardId("sfd-105-221"),
  might: 5,
  name: "Ruin Runner",
  rarity: "uncommon",
  rulesText: "I can't be chosen by enemy spells and abilities.",
  setId: "SFD",
};
