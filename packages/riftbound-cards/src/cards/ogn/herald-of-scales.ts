import type { Ability } from "@tcg/riftbound-types";
import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Herald of Scales — ogn-140-298
 *
 * Your Dragons' Energy costs are reduced by [2], to a minimum of [1].
 *
 * Captured as a virtual "CostReduction" keyword on friendly Dragon cards.
 * Engine support for tag-scoped cost reduction is not yet wired up; this
 * ability object shapes the intent for when it is.
 */
const abilities: Ability[] = [
  {
    effect: {
      keyword: "CostReduction",
      target: {
        controller: "friendly",
        filter: { tag: "Dragon" },
        type: "card",
      },
      type: "grant-keyword",
      value: 2,
    },
    type: "static",
  },
];

export const heraldOfScales: UnitCard = {
  abilities,
  cardNumber: 140,
  cardType: "unit",
  domain: "body",
  energyCost: 4,
  id: createCardId("ogn-140-298"),
  might: 3,
  name: "Herald of Scales",
  rarity: "uncommon",
  rulesText: "Your Dragons' Energy costs are reduced by [2], to a minimum of [1].",
  setId: "OGN",
};
