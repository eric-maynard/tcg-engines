import type { Ability } from "@tcg/riftbound-types";
import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Iascylla — unl-050-219
 *
 * "When I hold, at the start of your next Main Phase, you may move an enemy
 *  unit to this battlefield."
 *
 * Approximated as: on hold, immediately move an enemy unit to here
 * (simplification — the deferred "next main phase" timing isn't
 * structurally representable).
 */
const abilities: Ability[] = [
  {
    effect: {
      target: { controller: "enemy", type: "unit" },
      to: "here",
      type: "move",
    },
    optional: true,
    trigger: { event: "hold", on: "self" },
    type: "triggered",
  },
];

export const iascylla: UnitCard = {
  abilities,
  cardNumber: 50,
  cardType: "unit",
  domain: "calm",
  energyCost: 7,
  id: createCardId("unl-050-219"),
  might: 6,
  name: "Iascylla",
  rarity: "rare",
  rulesText:
    "When I hold, at the start of your next Main Phase, you may move an enemy unit to this battlefield.",
  setId: "UNL",
};
