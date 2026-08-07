import type { Ability } from "@tcg/riftbound-types";
import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Overt Operation — ogn-153-298
 *
 * "[Action] For each friendly unit, you may spend its buff to ready it. Then
 * buff all friendly units."
 *
 * Modeled as a sequence:
 *   1. An OPTIONAL spend-buff over every buffed friendly unit, readying them
 *      (rule 355.13 — the controller is asked, the option is never auto-taken).
 *   2. Buff all friendly units.
 */
const abilities: Ability[] = [
  {
    effect: {
      effects: [
        {
          optional: true,
          target: { controller: "friendly", filter: "buffed", quantity: "all", type: "unit" },
          then: { target: { type: "unit" }, type: "ready" },
          type: "spend-buff",
        },
        {
          target: { controller: "friendly", quantity: "all", type: "unit" },
          type: "buff",
        },
      ],
      type: "sequence",
    },
    timing: "action",
    type: "spell",
  },
];

export const overtOperation: SpellCard = {
  abilities,
  cardNumber: 153,
  cardType: "spell",
  domain: "body",
  energyCost: 5,
  id: createCardId("ogn-153-298"),
  name: "Overt Operation",
  rarity: "rare",
  rulesText:
    "[Action] (Play on your turn or in showdowns.)\nFor each friendly unit, you may spend its buff to ready it. Then buff all friendly units. (Each one that doesn't have a buff gets a +1 [Might] buff.)",
  setId: "OGN",
  timing: "action",
};
