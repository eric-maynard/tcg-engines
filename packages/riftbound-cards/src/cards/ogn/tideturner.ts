import type { Ability } from "@tcg/riftbound-types";
import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Tideturner — ogn-199-298
 *
 * [Hidden]
 * When you play me, you may choose a unit you control at another location.
 * Move me to its location and it to my original location.
 *
 * The swap-locations effect is modeled as a sequence of two moves:
 *   1. Move self to the chosen unit's location
 *   2. Move the chosen unit to self's original location
 */
const abilities: Ability[] = [
  { keyword: "Hidden", type: "keyword" },
  {
    effect: {
      effects: [
        {
          target: "self",
          to: "here",
          type: "move",
        },
        {
          target: { type: "trigger-source" },
          to: "here",
          type: "move",
        },
      ],
      type: "sequence",
    },
    optional: true,
    trigger: { event: "play-self" },
    type: "triggered",
  },
];

export const tideturner: UnitCard = {
  abilities,
  cardNumber: 199,
  cardType: "unit",
  domain: "chaos",
  energyCost: 2,
  id: createCardId("ogn-199-298"),
  might: 2,
  name: "Tideturner",
  rarity: "rare",
  rulesText:
    "[Hidden] (Hide now for [rainbow] to react with later for [energy_0].)\nWhen you play me, you may choose a unit you control at another location. Move me to its location and it to my original location.",
  setId: "OGN",
};
