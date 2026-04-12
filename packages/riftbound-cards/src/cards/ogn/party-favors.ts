import type { Ability } from "@tcg/riftbound-types";
import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Party Favors — ogn-071-298
 *
 * "Each other player chooses Cards or Runes. For each player that chooses
 *  Cards, you and that player each draw 1. For each player that chooses
 *  Runes, you and that player each channel 1 rune exhausted."
 *
 * Approximated as a choice between drawing (each) or channeling (each)
 * that the spell's controller resolves.
 */
const abilities: Ability[] = [
  {
    effect: {
      options: [
        {
          effect: { amount: 1, player: "each", type: "draw" },
          label: "Cards",
        },
        {
          effect: { amount: 1, exhausted: true, type: "channel" },
          label: "Runes",
        },
      ],
      type: "choice",
    },
    timing: "action",
    type: "spell",
  },
];

export const partyFavors: SpellCard = {
  abilities,
  cardNumber: 71,
  cardType: "spell",
  domain: "calm",
  energyCost: 3,
  id: createCardId("ogn-071-298"),
  name: "Party Favors",
  rarity: "rare",
  rulesText:
    "Each other player chooses Cards or Runes. For each player that chooses Cards, you and that player each draw 1. For each player that chooses Runes, you and that player each channel 1 rune exhausted.",
  setId: "OGN",
  timing: "action",
};
