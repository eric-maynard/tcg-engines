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
 *   1. For each friendly unit, an optional spend-buff-then-ready.
 *   2. Buff all friendly units.
 */
const abilities: Ability[] = [
  {
    effect: {
      effects: [
        {
          effect: {
            effect: {
              target: { type: "unit" },
              then: { target: { type: "unit" }, type: "ready" },
              type: "spend-buff",
            },
            type: "optional",
          },
          target: { controller: "friendly", type: "unit" },
          type: "for-each",
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
