import type { Ability } from "@tcg/riftbound-types";
import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Whirlwind — ogn-187-298
 *
 * "Starting with the next player, each player may return a unit to its
 *  owner's hand."
 *
 * Approximated as: return any unit to its owner's hand (optional).
 * Per-player looping isn't structurally representable in the effect union.
 */
const abilities: Ability[] = [
  {
    effect: {
      target: { type: "unit" },
      type: "return-to-hand",
    },
    timing: "action",
    type: "spell",
  },
];

export const whirlwind: SpellCard = {
  abilities,
  cardNumber: 187,
  cardType: "spell",
  domain: "chaos",
  energyCost: 3,
  id: createCardId("ogn-187-298"),
  name: "Whirlwind",
  rarity: "uncommon",
  rulesText: "Starting with the next player, each player may return a unit to its owner's hand.",
  setId: "OGN",
  timing: "action",
};
