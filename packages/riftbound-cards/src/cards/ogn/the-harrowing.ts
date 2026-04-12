import type { Ability } from "@tcg/riftbound-types";
import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * The Harrowing — ogn-198-298 (Action spell)
 *
 * Play a unit from your trash, ignoring its Energy cost.
 */
const abilities: Ability[] = [
  {
    effect: {
      from: "trash",
      ignoreCost: "energy",
      target: { controller: "friendly", type: "unit" },
      type: "play",
    },
    timing: "action",
    type: "spell",
  },
];

export const theHarrowing: SpellCard = {
  abilities,
  cardNumber: 198,
  cardType: "spell",
  domain: "chaos",
  energyCost: 6,
  id: createCardId("ogn-198-298"),
  name: "The Harrowing",
  rarity: "rare",
  rulesText:
    "Play a unit from your trash, ignoring its Energy cost. (You must still pay its Power cost.)",
  setId: "OGN",
  timing: "action",
};
