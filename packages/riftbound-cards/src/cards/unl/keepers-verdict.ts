import type { Ability } from "@tcg/riftbound-types";
import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Keeper's Verdict — unl-204-219 (Action spell)
 *
 * Choose an enemy unit at a battlefield. Its owner places it on the top
 * or bottom of their Main Deck.
 *
 * Approximated as a recycle-to-deck (bottom). Top-or-bottom choice is
 * not yet represented in the Effect DSL.
 */
const abilities: Ability[] = [
  {
    effect: {
      target: {
        controller: "enemy",
        location: "battlefield",
        type: "unit",
      },
      type: "recycle",
    },
    timing: "action",
    type: "spell",
  },
];

export const keepersVerdict: SpellCard = {
  abilities,
  cardNumber: 204,
  cardType: "spell",
  domain: ["body", "order"],
  energyCost: 2,
  id: createCardId("unl-204-219"),
  name: "Keeper's Verdict",
  rarity: "epic",
  rulesText:
    "[Action] (Play on your turn or in showdowns.)\nChoose an enemy unit at a battlefield. Its owner places it on the top or bottom of their Main Deck.",
  setId: "UNL",
  timing: "action",
};
