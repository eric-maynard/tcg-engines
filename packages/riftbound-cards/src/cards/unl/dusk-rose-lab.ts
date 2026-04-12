import type { Ability } from "@tcg/riftbound-types";
import type { BattlefieldCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Dusk Rose Lab — unl-209-219
 *
 * "At the start of your Beginning Phase, you may kill a unit you control
 *  here to draw 1."
 */
const abilities: Ability[] = [
  {
    effect: {
      effects: [
        {
          target: {
            controller: "friendly",
            location: "here",
            type: "unit",
          },
          type: "kill",
        },
        { amount: 1, type: "draw" },
      ],
      type: "sequence",
    },
    optional: true,
    trigger: {
      event: "beginning-phase",
      on: "controller",
      timing: "at",
    },
    type: "triggered",
  },
];

export const duskRoseLab: BattlefieldCard = {
  abilities,
  cardNumber: 209,
  cardType: "battlefield",
  id: createCardId("unl-209-219"),
  name: "Dusk Rose Lab",
  rarity: "uncommon",
  rulesText:
    "At the start of your Beginning Phase, you may kill a unit you control here to draw 1. (This happens before scoring.)",
  setId: "UNL",
};
