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
 *   - rule 356.1 — an ALTERNATE play cost: while the controller has spent [4]
 *     or more Energy to play a spell this turn, they may pay [mind] instead of
 *     the printed [4]. Read by `getAlternatePlayCost` in the engine's cost path.
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
      amount: 4,
      type: "spell-energy-spent-this-turn",
    },
    effect: {
      cost: { energy: 0, power: ["mind"] },
      type: "alternate-play-cost",
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
