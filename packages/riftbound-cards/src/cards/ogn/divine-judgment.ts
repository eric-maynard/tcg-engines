import type { Ability } from "@tcg/riftbound-types";
import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Divine Judgment — ogn-244-298 (Action spell)
 *
 * Each player chooses 2 units, 2 gear, 2 runes, and 2 cards in their
 * hands. Recycle the rest.
 *
 * One "keep 2" recycle over four categories: the handler prompts each player
 * per category that holds more than 2 and recycles the remainder (runes to the
 * Rune Deck, everything else to the Main Deck).
 */
const abilities: Ability[] = [
  {
    effect: {
      categories: ["unit", "gear", "rune", "hand"],
      keep: 2,
      type: "recycle",
    },
    timing: "action",
    type: "spell",
  },
];

export const divineJudgment: SpellCard = {
  abilities,
  cardNumber: 244,
  cardType: "spell",
  domain: "order",
  energyCost: 7,
  id: createCardId("ogn-244-298"),
  name: "Divine Judgment",
  rarity: "epic",
  rulesText:
    "Each player chooses 2 units, 2 gear, 2 runes, and 2 cards in their hands. Recycle the rest.",
  setId: "OGN",
  timing: "action",
};
