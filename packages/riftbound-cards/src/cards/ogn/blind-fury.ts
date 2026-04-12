import type { Ability } from "@tcg/riftbound-types";
import type { Effect } from "@tcg/riftbound-types/abilities/effect-types";
import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Blind Fury — ogn-025-298
 *
 * "[Action] Each opponent reveals the top card of their Main Deck. Choose one
 * and banish it, then play it, ignoring its cost. Then recycle the rest."
 *
 * Modeled as a sequence: reveal the top of each opponent's deck, banish one
 * (the "chosen" card), play it for free, then recycle the rest. Uses
 * `pendingValue` so the play step targets the card banished in the previous
 * step. `PlayEffect.target` is typed as `Target` rather than `AnyTarget`, so
 * we locally cast to `Effect` (same approach as the parser).
 */
const abilities: Ability[] = [
  {
    effect: {
      effects: [
        {
          amount: 1,
          from: "deck",
          type: "reveal",
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
    timing: "action",
    type: "spell",
  },
];

export const blindFury: SpellCard = {
  abilities,
  cardNumber: 25,
  cardType: "spell",
  domain: "fury",
  energyCost: 4,
  id: createCardId("ogn-025-298"),
  name: "Blind Fury",
  rarity: "rare",
  rulesText:
    "[Action] (Play on your turn or in showdowns.)\nEach opponent reveals the top card of their Main Deck. Choose one and banish it, then play it, ignoring its cost. Then recycle the rest.",
  setId: "OGN",
  timing: "action",
};
