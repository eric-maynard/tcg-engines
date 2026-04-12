import type { Ability } from "@tcg/riftbound-types";
import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Stealthy Pursuer — ogn-177-298
 *
 * When a friendly unit moves from my location, I may be moved with it.
 */
const abilities: Ability[] = [
  {
    effect: {
      target: "self",
      to: "same",
      type: "move",
    },
    optional: true,
    trigger: {
      event: "move",
      on: {
        cardType: "unit",
        controller: "friendly",
        excludeSelf: true,
        location: "here",
      },
    },
    type: "triggered",
  },
];

export const stealthyPursuer: UnitCard = {
  abilities,
  cardNumber: 177,
  cardType: "unit",
  domain: "chaos",
  energyCost: 4,
  id: createCardId("ogn-177-298"),
  might: 4,
  name: "Stealthy Pursuer",
  rarity: "common",
  rulesText: "When a friendly unit moves from my location, I may be moved with it.",
  setId: "OGN",
};
