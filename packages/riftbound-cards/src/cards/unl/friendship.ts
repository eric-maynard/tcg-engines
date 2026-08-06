import type { Ability } from "@tcg/riftbound-types";
import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Friendship — unl-046-219 (Reaction spell)
 *
 * Choose a unit. Give it +1 [Might] this turn for each of the following
 * tags among your units — Bird, Cat, Dog, and Poro.
 *
 * rule-id: unl-046-219 — amount is the number of listed tags present on at
 * least one friendly unit (`distinctTags`), not a filtered unit count (a
 * filter array ANDs, so no single unit could ever match all four tags).
 */
const abilities: Ability[] = [
  {
    effect: {
      amount: {
        among: { controller: "friendly", type: "unit" },
        distinctTags: ["Bird", "Cat", "Dog", "Poro"],
      },
      duration: "turn",
      target: { type: "unit" },
      type: "modify-might",
    },
    timing: "reaction",
    type: "spell",
  },
];

export const friendship: SpellCard = {
  abilities,
  cardNumber: 46,
  cardType: "spell",
  domain: "calm",
  energyCost: 1,
  id: createCardId("unl-046-219"),
  name: "Friendship",
  rarity: "uncommon",
  rulesText:
    "[Reaction] (Play any time, even before spells and abilities resolve.)\nChoose a unit. Give it +1 [Might] this turn for each of the following tags among your units — Bird, Cat, Dog, and Poro.",
  setId: "UNL",
  timing: "reaction",
};
