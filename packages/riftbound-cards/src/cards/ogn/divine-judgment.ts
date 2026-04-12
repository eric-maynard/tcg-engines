import type { Ability } from "@tcg/riftbound-types";
import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Divine Judgment — ogn-244-298 (Action spell)
 *
 * Each player chooses 2 units, 2 gear, 2 runes, and 2 cards in their
 * hands. Recycle the rest.
 *
 * Approximated as a sequence of four per-player recycle effects, each
 * targeting a different zone/card-type with a "keep 2, recycle the rest"
 * semantic. The engine's recycle effect executes against the unchosen
 * remainder when given a target plus an explicit amount.
 *
 * FIXME: The "keep N" semantic is expressed here via four separate recycle
 * steps rather than a first-class "keep N, recycle rest" primitive.
 */
const abilities: Ability[] = [
  {
    effect: {
      effects: [
        {
          from: "board",
          target: { controller: "any", quantity: "all", type: "unit" },
          type: "recycle",
        },
        {
          from: "board",
          target: { controller: "any", quantity: "all", type: "gear" },
          type: "recycle",
        },
        {
          from: "board",
          target: { controller: "any", quantity: "all", type: "rune" },
          type: "recycle",
        },
        {
          from: "hand",
          target: { controller: "any", quantity: "all", type: "card" },
          type: "recycle",
        },
      ],
      type: "sequence",
    },
    timing: "action",
    type: "spell",
  },
];

export const divineJudgment: SpellCard = {
  abilities,
  cardNumber: 244,
  cardType: "spell",
  domain: "order",
  energyCost: 7,
  id: createCardId("ogn-244-298"),
  name: "Divine Judgment",
  rarity: "epic",
  rulesText:
    "Each player chooses 2 units, 2 gear, 2 runes, and 2 cards in their hands. Recycle the rest.",
  setId: "OGN",
  timing: "action",
};
