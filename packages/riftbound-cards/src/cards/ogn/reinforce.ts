import type { Ability } from "@tcg/riftbound-types";
import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

// rule-id: ogn-062-298-look-pick-filter — the parser drops the "banish a
// unit from among them" clause, so the pick must be hand-restricted to units.
// rule-id: ogn-062-298-look-banish-play — the pick is banished then played
// at [5] less, not drawn to hand.
const abilities: Ability[] = [
  {
    effect: {
      amount: 5,
      filter: {
        excludeCardTypes: ["spell", "gear", "equipment", "legend", "battlefield", "rune"],
      },
      from: "deck",
      onPicked: "play",
      optional: true,
      reduceCost: { energy: 5 },
      type: "look",
    },
    timing: "action",
    type: "spell",
  },
];

export const reinforce: SpellCard = {
  abilities,
  cardNumber: 62,
  cardType: "spell",
  domain: "calm",
  energyCost: 5,
  id: createCardId("ogn-062-298"),
  name: "Reinforce",
  rarity: "uncommon",
  rulesText:
    "Look at the top 5 cards of your Main Deck. You may banish a unit from among them, then play it, reducing its cost by [5]. Recycle the remaining cards.",
  setId: "OGN",
  timing: "action",
};
