import type { Ability } from "@tcg/riftbound-types";
import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

// Rule 383.4.e: "When I attack" is an Attack Trigger — must be declared in
// `abilities` so the engine places it on the chain when this unit gains the
// Attacker designation.
const abilities: Ability[] = [
  {
    condition: { cost: { energy: 1 }, type: "pay-cost" },
    effect: {
      amount: -1,
      duration: "turn",
      target: { location: "here", type: "unit" },
      type: "modify-might",
    },
    optional: true,
    trigger: { event: "attack", on: "self" },
    type: "triggered",
  },
];

export const icevaleArcher: UnitCard = {
  abilities,
  cardNumber: 65,
  cardType: "unit",
  domain: "mind",
  energyCost: 2,
  id: createCardId("unl-065-219"),
  might: 2,
  name: "Icevale Archer",
  rarity: "common",
  rulesText: "When I attack, you may pay [1] to give a unit here -1 [Might] this turn.",
  setId: "UNL",
};
