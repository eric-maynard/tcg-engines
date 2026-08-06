import type { Ability } from "@tcg/riftbound-types";
import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

// rule 430.3 — channel as many runes as the Rune Deck holds; the fallback draw
// fires whenever fewer than 2 were channeled ("If you couldn't channel 2 runes
// this way"). The parser drops the trailing conditional, so state it here.
const abilities: Ability[] = [
  {
    effect: {
      effects: [
        { amount: 2, exhausted: true, type: "channel" },
        {
          condition: { amount: 2, type: "channeled-fewer-than" },
          then: { amount: 1, type: "draw" },
          type: "conditional",
        },
      ],
      type: "sequence",
    },
    timing: "action",
    type: "spell",
  } as Ability,
];

export const catalystOfAeons: SpellCard = {
  abilities,
  cardNumber: 138,
  cardType: "spell",
  domain: "body",
  energyCost: 4,
  id: createCardId("ogn-138-298"),
  name: "Catalyst of Aeons",
  rarity: "uncommon",
  rulesText: "Channel 2 runes exhausted. If you couldn't channel 2 runes this way, draw 1.",
  setId: "OGN",
  timing: "action",
};
