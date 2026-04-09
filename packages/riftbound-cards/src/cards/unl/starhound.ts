import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const starhound: UnitCard = {
  cardNumber: 167,
  cardType: "unit",
  domain: "order",
  energyCost: 5,
  id: createCardId("unl-167-219"),
  might: 6,
  name: "Starhound",
  rarity: "uncommon",
  rulesText: "When you play me, return a Bird, Cat, Dog, or Poro from your trash to your hand.",
  setId: "UNL",
};
