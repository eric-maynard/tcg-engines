import type { Ability } from "@tcg/riftbound-types";
import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

// rule 355.10 — "Choose a friendly unit without [Temporary]" is a targeting
// restriction, so enemy units and units that already carry Temporary are not
// legal choices (and with none available the spell can't be played at all).
// Draw 2 is unconditional (359.3) and stays a separate sequence step.
const abilities: Ability[] = [
  {
    effect: {
      effects: [
        {
          keyword: "Temporary",
          target: {
            controller: "friendly",
            filter: { excludeKeyword: "Temporary" },
            type: "unit",
          },
          type: "grant-keyword",
        },
        { amount: 2, type: "draw" },
      ],
      type: "sequence",
    },
    type: "spell",
  },
];

export const shadowsCall: SpellCard = {
  abilities,
  cardNumber: 165,
  cardType: "spell",
  domain: "order",
  energyCost: 2,
  id: createCardId("unl-165-219"),
  name: "Shadow's Call",
  rarity: "uncommon",
  rulesText:
    "Choose a friendly unit without [Temporary]. Give it [Temporary]. Draw 2. (Kill it at the start of its controller's Beginning Phase, before scoring.)",
  setId: "UNL",
  timing: "action",
};
