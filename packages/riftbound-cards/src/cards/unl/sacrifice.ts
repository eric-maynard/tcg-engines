import type { Ability } from "@tcg/riftbound-types";
import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Sacrifice — unl-173-219 (Reaction spell)
 *
 * As an additional cost to play this, kill a friendly [Mighty] unit.
 * Draw 2 and channel 1 rune exhausted.
 *
 * The kill-a-friendly-unit additional cost is captured as a condition
 * gating the spell; the engine wires this to the additionalCost pipeline.
 */
const abilities: Ability[] = [
  {
    additionalCost: {
      kill: {
        controller: "friendly",
        filter: "mighty",
        type: "unit",
      },
    },
    effect: {
      effects: [
        { amount: 2, type: "draw" },
        { amount: 1, exhausted: true, type: "channel" },
      ],
      type: "sequence",
    },
    timing: "reaction",
    type: "spell",
  },
];

export const sacrifice: SpellCard = {
  abilities,
  cardNumber: 173,
  cardType: "spell",
  domain: "order",
  energyCost: 1,
  id: createCardId("unl-173-219"),
  name: "Sacrifice",
  rarity: "rare",
  rulesText:
    "[Reaction] (Play any time, even before spells and abilities resolve.)\nAs an additional cost to play this, kill a friendly [Mighty] unit. (A unit is Mighty while it has 5+ [Might].)\nDraw 2 and channel 1 rune exhausted.",
  setId: "UNL",
  timing: "reaction",
};
