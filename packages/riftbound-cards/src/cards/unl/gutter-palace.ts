import type { Ability } from "@tcg/riftbound-types";
import type { GearCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Gutter Palace — unl-088-219
 *
 * - At the start of your Beginning Phase, if you have exactly 4 cards in
 *   hand and exactly 4 units at battlefields, you win the game.
 * - Discard 1, [Exhaust]: Play a 1 [Might] Bird unit token with [Deflect].
 */
const abilities: Ability[] = [
  {
    condition: {
      conditions: [
        {
          count: 4,
          target: { controller: "friendly", location: "hand", type: "card" },
          type: "has-exactly",
        },
        {
          count: 4,
          target: {
            controller: "friendly",
            location: "battlefield",
            type: "unit",
          },
          type: "has-exactly",
        },
      ],
      type: "and",
    },
    effect: { type: "win-game" },
    trigger: { event: "beginning-phase", on: "controller", timing: "at" },
    type: "triggered",
  },
  {
    cost: { discard: 1, exhaust: true },
    effect: {
      token: {
        keywords: ["Deflect"],
        might: 1,
        name: "Bird",
        type: "unit",
      },
      type: "create-token",
    },
    type: "activated",
  },
];

export const gutterPalace: GearCard = {
  abilities,
  cardNumber: 88,
  cardType: "gear",
  domain: "mind",
  energyCost: 4,
  id: createCardId("unl-088-219"),
  name: "Gutter Palace",
  rarity: "epic",
  rulesText:
    "At the start of your Beginning Phase, if you have exactly 4 cards in hand and exactly 4 units at battlefields, you win the game.\nDiscard 1, [Exhaust]: Play a 1 [Might] Bird unit token with [Deflect]. (Opponents must pay [rainbow] to choose it with a spell or ability.)",
  setId: "UNL",
};
