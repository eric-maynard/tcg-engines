import type { Ability } from "@tcg/riftbound-types";
import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

// Rule 383.4.e: "When I attack" is an Attack Trigger — must be declared in
// `abilities` so the engine places it on the chain when this unit gains the
// Attacker designation.
const abilities: Ability[] = [
  {
    effect: {
      condition: {
        comparison: { gte: 1 },
        target: { controller: "enemy", filter: "ready", location: "here", type: "unit" },
        type: "count",
      },
      then: { amount: 2, duration: "turn", target: "self", type: "modify-might" },
      type: "conditional",
    },
    trigger: { event: "attack", on: "self" },
    type: "triggered",
  },
];

export const duneDrake: UnitCard = {
  abilities,
  cardNumber: 131,
  cardType: "unit",
  domain: "body",
  energyCost: 5,
  id: createCardId("ogn-131-298"),
  might: 5,
  name: "Dune Drake",
  rarity: "common",
  rulesText: "When I attack, give me +2 [Might] this turn if there is a ready enemy unit here.",
  setId: "OGN",
  tags: ["Dragon"], // printed DRAGON tag (missing from set data)
};
