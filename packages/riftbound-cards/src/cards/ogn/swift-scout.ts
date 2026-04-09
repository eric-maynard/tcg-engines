import type { LegendCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const swiftScout: LegendCard = {
  cardNumber: 263,
  cardType: "legend",
  championTag: "Teemo",
  domain: ["mind", "chaos"],
  id: createCardId("ogn-263-298"),
  name: "Swift Scout",
  rarity: "rare",
  rulesText:
    "You may pay [1] to hide a card with [Hidden] instead of [rainbow].\n[1], [Exhaust]: Put a Teemo unit you own into your hand from your Champion Zone or the board.",
  setId: "OGN",
};
