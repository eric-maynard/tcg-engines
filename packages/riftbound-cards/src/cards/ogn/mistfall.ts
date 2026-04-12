import type { Ability } from "@tcg/riftbound-types";
import type { GearCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Mistfall — ogn-152-298
 *
 * "When you buff a friendly unit, you may pay [body] and exhaust this to
 *  ready it."
 */
const abilities: Ability[] = [
  {
    condition: {
      cost: { exhaust: true, power: ["body"] },
      type: "pay-cost",
    },
    effect: {
      target: { type: "trigger-source" },
      type: "ready",
    },
    optional: true,
    trigger: {
      event: "buff",
      on: { cardType: "unit", controller: "friendly" },
    },
    type: "triggered",
  },
];

export const mistfall: GearCard = {
  abilities,
  cardNumber: 152,
  cardType: "gear",
  domain: "body",
  energyCost: 3,
  id: createCardId("ogn-152-298"),
  name: "Mistfall",
  rarity: "rare",
  rulesText: "When you buff a friendly unit, you may pay [body] and exhaust this to ready it.",
  setId: "OGN",
};
