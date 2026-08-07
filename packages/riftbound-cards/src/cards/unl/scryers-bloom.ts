import type { Ability } from "@tcg/riftbound-types";
import type { GearCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Scryer's Bloom — unl-136-219
 *
 * - This enters exhausted.
 * - Kill this, [1], [Exhaust]: [Predict 2], then draw 1. Gain 1 XP.
 */
// rule 203.1: "Kill this, [1], [Exhaust]" are all activation COSTS.
// rule 436 / 359.3.e: the whole Predict (including the put-back order) finishes
// before the "then draw 1", so the drawn card is what was left on top.
const abilities: Ability[] = [
  {
    effect: { type: "enters-exhausted" },
    type: "static",
  } as unknown as Ability,
  {
    cost: {
      energy: 1,
      exhaust: true,
      kill: "self",
    },
    effect: {
      effects: [
        { amount: 2, type: "predict" },
        { amount: 1, type: "draw" },
        { amount: 1, type: "gain-xp" },
      ],
      type: "sequence",
    },
    type: "activated",
  },
];

export const scryersBloom: GearCard = {
  abilities,
  cardNumber: 136,
  cardType: "gear",
  domain: "chaos",
  energyCost: 1,
  id: createCardId("unl-136-219"),
  name: "Scryer's Bloom",
  rarity: "uncommon",
  rulesText:
    "This enters exhausted.\nKill this, [1], [Exhaust]: [Predict 2], then draw 1. Gain 1 XP.  (To Predict 2, look at the top two cards of your Main Deck. Recycle any of them and put the rest back in any order.)",
  setId: "UNL",
};
