import type { Ability } from "@tcg/riftbound-types";
import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Jhin, Meticulous Killer — unl-089-219
 *
 * "[Vision] (When you play me, look at the top card of your Main Deck. You
 *  may recycle it.)
 *  If you've spent [4] or more to play a spell this turn, you may play me
 *  for [mind]."
 *
 * Modeled as:
 *   - Vision keyword-effect (look at top, may recycle).
 *   - A conditional static AltPlayCost grant. The actual alt-cost mechanic
 *     is not in the Effect union; this captures the intent.
 */
const abilities: Ability[] = [
  {
    effect: {
      amount: 1,
      from: "deck",
      then: { recycle: 1 },
      type: "look",
    },
    keyword: "Vision",
    type: "keyword",
  },
  {
    condition: {
      count: { gte: 4 },
      event: "spent-power",
      type: "this-turn",
    },
    effect: {
      keyword: "AltPlayCost",
      target: "self",
      type: "grant-keyword",
    },
    type: "static",
  },
];

export const jhinMeticulousKiller: UnitCard = {
  abilities,
  cardNumber: 89,
  cardType: "unit",
  domain: "mind",
  energyCost: 4,
  id: createCardId("unl-089-219"),
  isChampion: true,
  might: 4,
  name: "Jhin, Meticulous Killer",
  rarity: "epic",
  rulesText:
    "[Vision] (When you play me, look at the top card of your Main Deck. You may recycle it.)\nIf you've spent [4] or more to play a spell this turn, you may play me for [mind].",
  setId: "UNL",
  tags: ["Jhin"],
};
