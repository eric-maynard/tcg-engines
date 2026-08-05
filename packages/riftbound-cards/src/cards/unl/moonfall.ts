import type { Ability, Effect } from "@tcg/riftbound-types";
import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

// Rule 355.2 / 355.8 (unl-198-219): the parser drops the "Choose a battlefield
// where you have units" preamble and defaults "to that battlefield" → "base",
// so hand-author the spell effect. The chosen battlefield is bound as the
// sequence's target and referenced as "here" by the move destination and the
// modify-might location.
const abilities: Ability[] = [
  {
    effect: {
      effects: [
        {
          target: { controller: "enemy", quantity: { upTo: 1 }, type: "unit" },
          to: "here",
          type: "move",
        },
        {
          amount: -2,
          duration: "turn",
          target: { controller: "enemy", location: "here", quantity: "all", type: "unit" },
          type: "modify-might",
        },
      ],
      target: { filter: { hasFriendlyUnits: true }, type: "battlefield" },
      type: "sequence",
    } as unknown as Effect,
    timing: "action",
    type: "spell",
  },
];

export const moonfall: SpellCard = {
  abilities,
  cardNumber: 198,
  cardType: "spell",
  domain: ["mind", "chaos"],
  energyCost: 3,
  id: createCardId("unl-198-219"),
  name: "Moonfall",
  rarity: "epic",
  rulesText:
    "[Action] (Play on your turn or in showdowns.)\nChoose a battlefield where you have units. You may move up to one enemy unit to that battlefield. Then give enemy units there -2 [Might] this turn.",
  setId: "UNL",
  timing: "action",
};
