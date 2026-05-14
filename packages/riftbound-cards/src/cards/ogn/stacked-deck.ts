import type { Ability } from "@tcg/riftbound-types";
import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Stacked Deck — ogn-183-298 (Action spell, Chaos)
 *
 * "Look at the top 3 cards of your Main Deck. Put 1 into your hand and
 *  recycle the rest."
 *
 * Modeled as an Action spell whose effect is the engine's `look` primitive
 * with `then: { recycle: "rest" }`. The engine reads the directive and
 * writes a `look-and-pick` pendingChoice listing the top 3 cards; the
 * active player resolves by picking one (→ hand) and the remainder are
 * sent to the bottom of the deck via `resolvePendingChoice` (rule 416
 * recycle semantics).
 */
const abilities: Ability[] = [
  {
    effect: {
      amount: 3,
      from: "deck",
      then: { recycle: "rest" },
      type: "look",
    },
    timing: "action",
    type: "spell",
  },
];

export const stackedDeck: SpellCard = {
  abilities,
  cardNumber: 183,
  cardType: "spell",
  domain: "chaos",
  energyCost: 1,
  id: createCardId("ogn-183-298"),
  name: "Stacked Deck",
  rarity: "uncommon",
  rulesText:
    "[Action] (Play on your turn or in showdowns.)\nLook at the top 3 cards of your Main Deck. Put 1 into your hand and recycle the rest.",
  setId: "OGN",
  timing: "action",
};
