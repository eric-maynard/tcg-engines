import type { Ability } from "@tcg/riftbound-types";
import type { GearCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Spirit Wheel — sfd-144-221
 *
 * When you choose a friendly unit, you may pay [1] and exhaust this
 * to draw 1.
 *
 * Trigger: choose-friendly-unit event
 * Cost: pay 1 energy + exhaust self
 * Effect: draw 1
 */
const abilities: Ability[] = [
  {
    condition: {
      cost: { energy: 1, exhaust: true },
      type: "pay-cost",
    },
    effect: { amount: 1, type: "draw" },
    optional: true,
    trigger: {
      event: "choose",
      on: { cardType: "unit", controller: "friendly" },
    },
    type: "triggered",
  },
];

export const spiritWheel: GearCard = {
  abilities,
  cardNumber: 144,
  cardType: "gear",
  domain: "chaos",
  energyCost: 2,
  id: createCardId("sfd-144-221"),
  name: "Spirit Wheel",
  rarity: "rare",
  rulesText: "When you choose a friendly unit, you may pay [1] and exhaust this to draw 1.",
  setId: "SFD",
};
