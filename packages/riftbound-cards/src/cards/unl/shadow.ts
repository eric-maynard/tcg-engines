import type { Ability } from "@tcg/riftbound-types";
import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Shadow — unl-194-219
 *
 * "If you play me to a battlefield, I enter ready.
 *  [Action][>] [1][rainbow], [Exhaust]: [Stun] an enemy unit attacking here."
 *
 * Modeled as:
 *   - Static grants EntersReady (conditional by play location — approx.).
 *   - Activated ability: pay 1+rainbow + exhaust → stun an attacking enemy
 *     here.
 */
const abilities: Ability[] = [
  {
    effect: {
      keyword: "EntersReady",
      target: "self",
      type: "grant-keyword",
    },
    type: "static",
  },
  {
    cost: { energy: 1, exhaust: true, power: ["rainbow"] },
    effect: {
      target: {
        controller: "enemy",
        filter: "attacking",
        location: "here",
        type: "unit",
      },
      type: "stun",
    },
    timing: "action",
    type: "activated",
  },
];

export const shadow: UnitCard = {
  abilities,
  cardNumber: 194,
  cardType: "unit",
  domain: ["calm", "chaos"],
  energyCost: 3,
  id: createCardId("unl-194-219"),
  might: 3,
  name: "Shadow",
  rarity: "epic",
  rulesText:
    "If you play me to a battlefield, I enter ready.\n[Action][&gt;] [1][rainbow], [Exhaust]: [Stun] an enemy unit attacking here. (It doesn't deal combat damage this turn.)",
  setId: "UNL",
};
