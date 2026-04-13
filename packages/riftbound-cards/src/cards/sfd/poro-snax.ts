import type { Ability } from "@tcg/riftbound-types";
import type { GearCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Poro Snax — sfd-046-221
 *
 * - When played, draw 1.
 * - [1][calm], [Exhaust], Kill this: Draw 1.
 */
const abilities: Ability[] = [
  {
    effect: { amount: 1, type: "draw" },
    trigger: { event: "play-self" },
    type: "triggered",
  },
  {
    cost: {
      energy: 1,
      exhaust: true,
      kill: "self",
      power: ["calm"],
    },
    effect: { amount: 1, type: "draw" },
    type: "activated",
  },
];

export const poroSnax: GearCard = {
  abilities,
  cardNumber: 46,
  cardType: "gear",
  domain: "calm",
  energyCost: 1,
  id: createCardId("sfd-046-221"),
  name: "Poro Snax",
  rarity: "uncommon",
  rulesText: "When you play this, draw 1.\n[1][calm], [Exhaust], Kill this: Draw 1.",
  setId: "SFD",
};
