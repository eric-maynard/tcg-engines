import type { Ability } from "@tcg/riftbound-types";
import type { Effect } from "@tcg/riftbound-types/abilities/effect-types";
import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Cruel Patron — ogn-208-298
 *
 * As an additional cost to play me, kill a friendly unit.
 *
 * Modeled as a static `additional-cost-option` ability — the same shape the
 * parser emits for "You may pay COST as an additional cost to play me"
 * patterns. This isn't in the formal Effect union yet, so we cast to match
 * how the parser's `parseAdditionalCostAbility` produces it.
 */
const abilities: Ability[] = [
  {
    effect: {
      additionalCost: {
        kill: { controller: "friendly", type: "unit" },
      },
      optional: false,
      type: "additional-cost-option",
    } as unknown as Effect,
    type: "static",
  },
];

export const cruelPatron: UnitCard = {
  abilities,
  cardNumber: 208,
  cardType: "unit",
  domain: "order",
  energyCost: 4,
  id: createCardId("ogn-208-298"),
  might: 6,
  name: "Cruel Patron",
  rarity: "common",
  rulesText: "As an additional cost to play me, kill a friendly unit.",
  setId: "OGN",
};
