import type { LegendCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const looseCannon: LegendCard = {
  cardNumber: 251,
  cardType: "legend",
  championTag: "Jinx",
  domain: ["fury", "chaos"],
  id: createCardId("ogn-251-298"),
  name: "Loose Cannon",
  rarity: "rare",
  rulesText:
    "At start of your Beginning Phase, draw 1 if you have one or fewer cards in your hand.",
  setId: "OGN",
};
