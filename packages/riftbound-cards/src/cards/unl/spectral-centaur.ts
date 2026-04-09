import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const spectralCentaur: UnitCard = {
  cardNumber: 68,
  cardType: "unit",
  domain: "mind",
  energyCost: 6,
  id: createCardId("unl-068-219"),
  might: 5,
  name: "Spectral Centaur",
  rarity: "common",
  rulesText: "When another friendly unit dies, give me +2 [Might] this turn.",
  setId: "UNL",
};
