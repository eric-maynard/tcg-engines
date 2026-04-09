import type { GearCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const orbOfRegret: GearCard = {
  cardNumber: 90,
  cardType: "gear",
  domain: "mind",
  energyCost: 1,
  id: createCardId("ogn-090-298"),
  name: "Orb of Regret",
  rarity: "common",
  rulesText: "[Exhaust]: Give a unit -1 [Might] this turn, to a minimum of 1 [Might].",
  setId: "OGN",
};
