import type { Ability } from "@tcg/riftbound-types";
import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * LeBlanc, Everywhere at Once — unl-090-219
 *
 * [Backline]
 * Your [Temporary] effects at my battlefield don't trigger.
 */
// Backline isn't in the SimpleKeyword type union yet, so it's represented
// As a grant-keyword static self effect that the engine recognizes.
const abilities: Ability[] = [
  {
    effect: {
      keyword: "Backline",
      target: "self",
      type: "grant-keyword",
    },
    type: "static",
  },
  {
    effect: {
      keyword: "SuppressTemporaryHere",
      target: "self",
      type: "grant-keyword",
    },
    type: "static",
  },
];

export const leblancEverywhereAtOnce: UnitCard = {
  abilities,
  cardNumber: 90,
  cardType: "unit",
  domain: "mind",
  energyCost: 4,
  id: createCardId("unl-090-219"),
  isChampion: true,
  might: 4,
  name: "LeBlanc, Everywhere at Once",
  rarity: "epic",
  rulesText:
    "[Backline] (I must be assigned combat damage last.)\nYour [Temporary] effects at my battlefield don't trigger.",
  setId: "UNL",
  tags: ["LeBlanc"],
};
