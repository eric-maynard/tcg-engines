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
        // rule 108.2 / 127.1 — "you own" is ownership, not control; rule
        // 355.9.a.5 — the Champion Zone is an off-board pool the board scan
        // never visits, so it is unioned in as its own branch.
        anyOf: [
          { filter: { tag: "Teemo" }, location: "anywhere", owner: "friendly", type: "unit" },
          { filter: { tag: "Teemo" }, location: "championZone", owner: "friendly", type: "unit" },
        ],
        filter: { tag: "Teemo" },
        owner: "friendly",
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
