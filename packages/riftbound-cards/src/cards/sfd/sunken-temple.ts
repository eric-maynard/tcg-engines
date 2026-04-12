import type { Ability } from "@tcg/riftbound-types";
import type { BattlefieldCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Sunken Temple — sfd-218-221 (Battlefield)
 *
 * When you conquer here with one or more [Mighty] units, you may pay
 * [1] to draw 1.
 *
 * The "with one or more Mighty units" qualifier isn't expressible as a
 * single condition yet; approximate with a friendly Mighty-count >= 1
 * check bolted onto the pay-cost condition.
 */
const abilities: Ability[] = [
  {
    condition: {
      conditions: [
        {
          count: 1,
          target: {
            controller: "friendly",
            filter: "mighty",
            location: "here",
            type: "unit",
          },
          type: "has-at-least",
        },
        { cost: { energy: 1 }, type: "pay-cost" },
      ],
      type: "and",
    },
    effect: { amount: 1, type: "draw" },
    optional: true,
    trigger: {
      event: "conquer",
      on: { controller: "friendly", location: "here" },
    },
    type: "triggered",
  },
];

export const sunkenTemple: BattlefieldCard = {
  abilities,
  cardNumber: 218,
  cardType: "battlefield",
  id: createCardId("sfd-218-221"),
  name: "Sunken Temple",
  rarity: "uncommon",
  rulesText:
    "When you conquer here with one or more [Mighty] units, you may pay [1] to draw 1. (A unit is Mighty while it has 5+ [Might].)",
  setId: "SFD",
};
