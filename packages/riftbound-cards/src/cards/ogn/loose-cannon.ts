import type { Ability } from "@tcg/riftbound-types";
import type { LegendCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

// Rule 383.2.a.1 / 383.3: the "if you have one or fewer cards" clause is part
// of the effect, not the trigger condition — the trigger always goes on the
// chain at the start of the controller's Beginning Phase and the hand-size
// check happens at resolution.
const abilities: Ability[] = [
  {
    effect: {
      condition: {
        comparison: { lte: 1 },
        target: { controller: "friendly", location: "hand", type: "card" },
        type: "count",
      },
      then: { amount: 1, type: "draw" },
      type: "conditional",
    },
    trigger: { event: "beginning-phase", on: "controller", timing: "at" },
    type: "triggered",
  },
];

export const looseCannon: LegendCard = {
  abilities,
  cardNumber: 251,
  cardType: "legend",
  championTag: "Jinx",
  domain: ["fury", "chaos"],
  id: createCardId("ogn-251-298"),
  name: "Loose Cannon",
  rarity: "rare",
  rulesText:
    "At start of your Beginning Phase, draw 1 if you have one or fewer cards in your hand.",
  setId: "OGN",
};
