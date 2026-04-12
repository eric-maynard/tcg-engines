import type { Ability } from "@tcg/riftbound-types";
import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * En Garde — ogn-046-298
 *
 * "[Reaction] Give a friendly unit +1 [Might] this turn, then an additional
 *  +1 [Might] this turn if it is the only unit you control there."
 *
 * Modeled as a sequence: +1 might, then a conditional +1 if alone.
 */
const abilities: Ability[] = [
  {
    effect: {
      effects: [
        {
          amount: 1,
          duration: "turn",
          target: { controller: "friendly", type: "unit" },
          type: "modify-might",
        },
        {
          condition: { target: { type: "unit" }, type: "while-alone" },
          then: {
            amount: 1,
            duration: "turn",
            target: { controller: "friendly", type: "unit" },
            type: "modify-might",
          },
          type: "conditional",
        },
      ],
      type: "sequence",
    },
    timing: "reaction",
    type: "spell",
  },
];

export const enGarde: SpellCard = {
  abilities,
  cardNumber: 46,
  cardType: "spell",
  domain: "calm",
  energyCost: 1,
  id: createCardId("ogn-046-298"),
  name: "En Garde",
  rarity: "common",
  rulesText:
    "[Reaction] (Play any time, even before spells and abilities resolve.)\nGive a friendly unit +1 [Might] this turn, then an additional +1 [Might] this turn if it is the only unit you control there.",
  setId: "OGN",
  timing: "reaction",
};
