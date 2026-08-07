import type { Ability } from "@tcg/riftbound-types";
import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * "Give a friendly unit +1 [Might] this turn and [Stun] an enemy unit at ITS
 * location." rule 359.3.f: "its" refers to the first target, so the stunned
 * enemy must share the chosen FRIENDLY unit's location — not the spell's own
 * "here" (which the generic parser emits).
 */
const abilities: Ability[] = [
  {
    effect: {
      effects: [
        {
          amount: 1,
          duration: "turn",
          target: { controller: "friendly", type: "unit" },
          type: "modify-might",
        },
        {
          target: { controller: "enemy", location: "same", type: "unit" },
          type: "stun",
        },
      ],
      type: "sequence",
    },
    timing: "action",
    type: "spell",
  },
];

export const heroicCharge: SpellCard = {
  abilities,
  cardNumber: 155,
  cardType: "spell",
  domain: "order",
  energyCost: 3,
  id: createCardId("unl-155-219"),
  name: "Heroic Charge",
  rarity: "common",
  rulesText:
    "[Action] (Play on your turn or in showdowns.)\nGive a friendly unit +1 [Might] this turn and [Stun] an enemy unit at its location. (A stunned unit doesn't deal combat damage this turn.)",
  setId: "UNL",
  timing: "action",
};
