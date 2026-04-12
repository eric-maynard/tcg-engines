import type { Ability } from "@tcg/riftbound-types";
import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Loyal Pup — sfd-126-221
 *
 * "When you defend at a battlefield, you may move me there."
 */
const abilities: Ability[] = [
  {
    effect: {
      target: "self",
      to: "here",
      type: "move",
    },
    optional: true,
    trigger: {
      event: "defend",
      on: "controller",
    },
    type: "triggered",
  },
];

export const loyalPup: UnitCard = {
  abilities,
  cardNumber: 126,
  cardType: "unit",
  domain: "chaos",
  energyCost: 3,
  id: createCardId("sfd-126-221"),
  might: 3,
  name: "Loyal Pup",
  rarity: "common",
  rulesText: "When you defend at a battlefield, you may move me there.",
  setId: "SFD",
};
