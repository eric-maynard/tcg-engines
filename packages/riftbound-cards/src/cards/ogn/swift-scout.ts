import type { Ability } from "@tcg/riftbound-types";
import type { LegendCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Swift Scout — ogn-263-298 (Legend, Teemo)
 *
 * You may pay [1] to hide a card with [Hidden] instead of [rainbow].
 * [1], [Exhaust]: Put a Teemo unit you own into your hand from your
 * Champion Zone or the board.
 */
const abilities: Ability[] = [
  {
    effect: {
      keyword: "HideCostReduction",
      target: "controller",
      type: "grant-keyword",
    },
    type: "static",
  },
  {
    cost: { energy: 1, exhaust: true },
    effect: {
      target: {
        controller: "friendly",
        filter: { tag: "Teemo" },
        location: "anywhere",
        type: "unit",
      },
      type: "return-to-hand",
    },
    type: "activated",
  },
];

export const swiftScout: LegendCard = {
  abilities,
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
