import type { LegendCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const nineTailedFox: LegendCard = {
  cardNumber: 255,
  cardType: "legend",
  championTag: "Ahri",
  domain: ["calm", "mind"],
  id: createCardId("ogn-255-298"),
  name: "Nine-Tailed Fox",
  rarity: "rare",
  rulesText:
    "When an enemy unit attacks a battlefield you control, give it -1 [Might] this turn, to a minimum of 1 [Might].",
  setId: "OGN",
};
