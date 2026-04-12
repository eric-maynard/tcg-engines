import type { Ability } from "@tcg/riftbound-types";
import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Maduli the Gatekeeper — unl-144-219
 *
 * "I can't be readied.
 *  [chaos]: Move me to an occupied enemy battlefield if my Might is greater
 *  than the total Might of enemy units there."
 */
const abilities: Ability[] = [
  {
    effect: {
      keyword: "CantReady",
      target: "self",
      type: "grant-keyword",
    },
    type: "static",
  },
  {
    cost: { power: ["chaos"] },
    effect: {
      target: "self",
      to: { battlefield: "enemy" },
      type: "move",
    },
    type: "activated",
  },
];

export const maduliTheGatekeeper: UnitCard = {
  abilities,
  cardNumber: 144,
  cardType: "unit",
  domain: "chaos",
  energyCost: 7,
  id: createCardId("unl-144-219"),
  might: 6,
  name: "Maduli the Gatekeeper",
  rarity: "rare",
  rulesText:
    "I can't be readied.\n[chaos]: Move me to an occupied enemy battlefield if my Might is greater than the total Might of enemy units there.",
  setId: "UNL",
};
