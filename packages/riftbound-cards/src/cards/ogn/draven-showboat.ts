import type { Ability } from "@tcg/riftbound-types";
import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Draven, Showboat — ogn-028-298
 *
 * My Might is increased by your points.
 *
 * Static self-buff scaling with controller's score.
 */
const abilities: Ability[] = [
  {
    effect: {
      amount: { score: "self" },
      target: "self",
      type: "modify-might",
    },
    type: "static",
  },
];

export const dravenShowboat: UnitCard = {
  abilities,
  cardNumber: 28,
  cardType: "unit",
  domain: "fury",
  energyCost: 5,
  id: createCardId("ogn-028-298"),
  isChampion: true,
  might: 3,
  name: "Draven, Showboat",
  rarity: "rare",
  rulesText: "My Might is increased by your points.",
  setId: "OGN",
  tags: ["Draven"],
};
