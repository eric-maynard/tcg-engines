import type { Ability } from "@tcg/riftbound-types";
import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Carnivorous Snapvine — ogn-149-298
 *
 * When you play me, choose an enemy unit at a battlefield. We deal
 * damage equal to our Mights to each other.
 *
 * Modelled as a `fight` effect with self as the attacker and the chosen
 * enemy unit as the defender.
 */
const abilities: Ability[] = [
  {
    effect: {
      attacker: "self",
      defender: {
        controller: "enemy",
        location: "battlefield",
        type: "unit",
      },
      type: "fight",
    },
    trigger: { event: "play-self" },
    type: "triggered",
  },
];

export const carnivorousSnapvine: UnitCard = {
  abilities,
  cardNumber: 149,
  cardType: "unit",
  domain: "body",
  energyCost: 5,
  id: createCardId("ogn-149-298"),
  might: 6,
  name: "Carnivorous Snapvine",
  rarity: "rare",
  rulesText:
    "When you play me, choose an enemy unit at a battlefield. We deal damage equal to our Mights to each other.",
  setId: "OGN",
};
