import type { Ability } from "@tcg/riftbound-types";
import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Keeper's Verdict — unl-204-219 (Action spell)
 *
 * Choose an enemy unit at a battlefield. Its owner places it on the top
 * or bottom of their Main Deck.
 *
 * rule-id: unl-204-219-owner-chooses-top-or-bottom — `position:
 * "owner-choice"` prompts the unit's owner (choose-destination:
 * mainDeck-top / mainDeck-bottom).
 */
const abilities: Ability[] = [
  {
    effect: {
      position: "owner-choice",
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
