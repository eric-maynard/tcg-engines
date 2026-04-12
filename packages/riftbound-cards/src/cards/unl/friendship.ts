import type { Ability } from "@tcg/riftbound-types";
import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Friendship — unl-046-219 (Reaction spell)
 *
 * Choose a unit. Give it +1 [Might] this turn for each of the following
 * tags among your units — Bird, Cat, Dog, and Poro.
 *
 * The "X distinct tags" count is approximated: the engine's AmountExpression
 * supports a `count` query but not "distinct tags among set". For now we
 * approximate as count(friendly units with those tags), which is an
 * over-count. A tighter model can be substituted once the DSL supports
 * distinct-tag counts.
 */
const abilities: Ability[] = [
  {
    effect: {
      amount: {
        count: {
          controller: "friendly",
          filter: [{ tag: "Bird" }, { tag: "Cat" }, { tag: "Dog" }, { tag: "Poro" }],
          type: "unit",
        },
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
