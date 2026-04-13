import type { Ability } from "@tcg/riftbound-types";
import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Diana, Lunari — unl-079-219
 *
 * "When a showdown begins here, you may pay [1]. If you do, [Predict], then
 *  reveal the top card of your Main Deck. If it's a spell, draw it."
 */
const abilities: Ability[] = [
  {
    condition: { cost: { energy: 1 }, type: "pay-cost" },
    effect: {
      effects: [
        { amount: 1, type: "predict" },
        {
          amount: 1,
          from: "deck",
          then: { draw: 1 },
          type: "reveal",
          until: "spell",
        },
      ],
      type: "sequence",
    },
    optional: true,
    trigger: {
      event: "attack",
      on: { location: "here" },
    },
    type: "triggered",
  },
];

export const dianaLunari: UnitCard = {
  abilities,
  cardNumber: 79,
  cardType: "unit",
  domain: "mind",
  energyCost: 3,
  id: createCardId("unl-079-219"),
  isChampion: true,
  might: 3,
  name: "Diana, Lunari",
  rarity: "rare",
  rulesText:
    "When a showdown begins here, you may pay [1]. If you do, [Predict], then reveal the top card of your Main Deck. If it's a spell, draw it. (To Predict, look at the top card of your Main Deck. You may recycle it.)",
  setId: "UNL",
  tags: ["Diana"],
};
