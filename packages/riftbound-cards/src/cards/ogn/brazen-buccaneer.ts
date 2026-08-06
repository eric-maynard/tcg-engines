import type { Ability } from "@tcg/riftbound-types";
import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

// rule 356.2.b / 204.2 — the discard is an optional additional cost chosen as
// the card is played; paying it reduces the base cost by [2].
const abilities: Ability[] = [
  {
    effect: {
      additionalCost: { discard: 1 },
      ifPaid: { reduction: 2, type: "cost-reduction" },
      optional: true,
      type: "additional-cost-option",
    },
    type: "static",
  },
];

export const brazenBuccaneer: UnitCard = {
  abilities,
  cardNumber: 2,
  cardType: "unit",
  domain: "fury",
  energyCost: 6,
  id: createCardId("ogn-002-298"),
  might: 5,
  name: "Brazen Buccaneer",
  rarity: "common",
  rulesText:
    "As you play me, you may discard 1 as an additional cost. If you do, reduce my cost by [2].",
  setId: "OGN",
};
