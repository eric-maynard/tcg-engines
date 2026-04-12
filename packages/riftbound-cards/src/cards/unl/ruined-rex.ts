import type { Ability } from "@tcg/riftbound-types";
import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Ruined Rex — unl-067-219
 *
 * [Deathknell][>] Deal 4 to an enemy unit.
 */
const abilities: Ability[] = [
  {
    effect: {
      amount: 4,
      target: { controller: "enemy", type: "unit" },
      type: "damage",
    },
    keyword: "Deathknell",
    type: "keyword",
  },
];

export const ruinedRex: UnitCard = {
  abilities,
  cardNumber: 67,
  cardType: "unit",
  domain: "mind",
  energyCost: 6,
  id: createCardId("unl-067-219"),
  might: 6,
  name: "Ruined Rex",
  rarity: "common",
  rulesText: "[Deathknell][&gt;] Deal 4 to an enemy unit. (When I die, get the effect.)",
  setId: "UNL",
};
