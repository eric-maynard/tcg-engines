import type { Ability } from "@tcg/riftbound-types";
import type { Effect } from "@tcg/riftbound-types/abilities/effect-types";
import type { GearCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Dazzling Aurora — ogn-160-298
 *
 * "At the end of your turn, reveal cards from the top of your Main Deck
 *  until you reveal a unit and banish it. Play it, ignoring its cost, and
 *  recycle the rest."
 *
 * Modeled as an end-of-turn trigger with a sequence: reveal-until-unit
 * (with banish as the `then`), then play the pending unit and recycle the
 * rest.
 */
const abilities: Ability[] = [
  {
    effect: {
      effects: [
        {
          amount: 1,
          from: "deck",
          type: "reveal",
          until: "unit",
        },
        {
          target: { type: "card" },
          type: "banish",
        },
        {
          ignoreCost: true,
          target: { type: "pending-value" },
          type: "play",
        } as unknown as Effect,
        {
          amount: 1,
          from: "board",
          type: "recycle",
        },
      ],
      pendingValue: { source: 1 },
      type: "sequence",
    },
    trigger: {
      event: "end-of-turn",
      on: "controller",
      timing: "at",
    },
    type: "triggered",
  },
];

export const dazzlingAurora: GearCard = {
  abilities,
  cardNumber: 160,
  cardType: "gear",
  domain: "body",
  energyCost: 9,
  id: createCardId("ogn-160-298"),
  name: "Dazzling Aurora",
  rarity: "epic",
  rulesText:
    "At the end of your turn, reveal cards from the top of your Main Deck until you reveal a unit and banish it. Play it, ignoring its cost, and recycle the rest.",
  setId: "OGN",
};
