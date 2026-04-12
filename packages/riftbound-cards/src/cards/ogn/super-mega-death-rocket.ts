import type { Ability } from "@tcg/riftbound-types";
import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Super Mega Death Rocket! — ogn-252-298
 *
 * - Spell: Deal 5 to a unit.
 * - Triggered (from trash): When you conquer, you may discard 1 to return
 *   this from your trash to your hand.
 */
const abilities: Ability[] = [
  {
    effect: {
      amount: 5,
      target: { type: "unit" },
      type: "damage",
    },
    timing: "action",
    type: "spell",
  },
  {
    condition: { cost: { discard: 1 }, type: "pay-cost" },
    effect: {
      target: "self",
      type: "return-to-hand",
    },
    optional: true,
    trigger: {
      event: "conquer",
      on: "controller",
    },
    type: "triggered",
  },
];

export const superMegaDeathRocket: SpellCard = {
  abilities,
  cardNumber: 252,
  cardType: "spell",
  domain: ["fury", "chaos"],
  energyCost: 4,
  id: createCardId("ogn-252-298"),
  name: "Super Mega Death Rocket!",
  rarity: "epic",
  rulesText:
    "Deal 5 to a unit.\nWhen you conquer, you may discard 1 to return this from your trash to your hand.",
  setId: "OGN",
  timing: "action",
};
