import type { Ability } from "@tcg/riftbound-types";
import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * "When I move to a battlefield, you may move an enemy unit to that battlefield."
 *
 * rule 359.3.f.3 — "that battlefield" is information from the trigger CONDITION,
 * so it is fixed when the trigger fires (the battlefield I moved to) and stays
 * valid even if I leave it before the ability resolves. That is the `to: "same"`
 * destination (the triggering move event's zone), not `here` (the source card's
 * zone at resolution time) and not the parser's default `base`.
 */
const abilities: Ability[] = [
  {
    effect: {
      target: { controller: "enemy", type: "unit" },
      to: "same",
      type: "move",
    },
    optional: true,
    trigger: { event: "move-to-battlefield", on: "self" },
    type: "triggered",
  },
];

export const irresistibleFaefolk: UnitCard = {
  abilities,
  cardNumber: 112,
  cardType: "unit",
  domain: "body",
  energyCost: 2,
  id: createCardId("unl-112-219"),
  might: 1,
  name: "Irresistible Faefolk",
  rarity: "rare",
  rulesText: "When I move to a battlefield, you may move an enemy unit to that battlefield.",
  setId: "UNL",
};
