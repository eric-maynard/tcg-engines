import type { Ability } from "@tcg/riftbound-types";
import type { Effect } from "@tcg/riftbound-types/abilities/effect-types";
import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Legion Quartermaster — sfd-044-221
 *
 * "As an additional cost to play me, return a friendly gear to its owner's
 *  hand."
 *
 * Modeled as a static additional-cost-option matching how the parser emits
 * other "As an additional cost..." cards.
 */
const abilities: Ability[] = [
  {
    effect: {
      additionalCost: {
        returnToHand: { controller: "friendly", type: "gear" },
      },
      optional: false,
      type: "additional-cost-option",
    } as unknown as Effect,
    type: "static",
  },
];

export const legionQuartermaster: UnitCard = {
  abilities,
  cardNumber: 44,
  cardType: "unit",
  domain: "calm",
  energyCost: 3,
  id: createCardId("sfd-044-221"),
  might: 4,
  name: "Legion Quartermaster",
  rarity: "uncommon",
  rulesText: "As an additional cost to play me, return a friendly gear to its owner's hand.",
  setId: "SFD",
};
