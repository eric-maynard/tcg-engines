import type { Ability } from "@tcg/riftbound-types";
import type { BattlefieldCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Ravenbloom Conservatory — sfd-215-221 (Battlefield)
 *
 * When you defend here, reveal the top card of your Main Deck. If it's
 * a spell, put it in your hand. Otherwise, recycle it.
 *
 * Trigger: defend at this battlefield
 * Effect: reveal top card; if spell, draw it, otherwise recycle it.
 */
const abilities: Ability[] = [
  {
    effect: {
      amount: 1,
      from: "deck",
      then: { draw: "chosen" },
      type: "reveal",
      until: "spell",
    },
    trigger: { event: "defend", on: "controller" },
    type: "triggered",
  },
];

export const ravenbloomConservatory: BattlefieldCard = {
  abilities,
  cardNumber: 215,
  cardType: "battlefield",
  id: createCardId("sfd-215-221"),
  name: "Ravenbloom Conservatory",
  rarity: "uncommon",
  rulesText:
    "When you defend here, reveal the top card of your Main Deck. If it's a spell, put it in your hand. Otherwise, recycle it.",
  setId: "SFD",
};
