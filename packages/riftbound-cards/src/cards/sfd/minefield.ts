import type { Ability } from "@tcg/riftbound-types";
import type { BattlefieldCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Minefield — sfd-212-221 (Battlefield)
 *
 * When you conquer here, put the top 2 cards of your Main Deck into
 * your trash.
 *
 * rule 440.1 / 424.1 — this is a straight mill: the cards go from the deck to
 * the trash without ever being looked at or revealed, so "as you look at or
 * reveal me" replacements (e.g. Nocturne, Horrifying) never apply.
 */
const abilities: Ability[] = [
  {
    effect: {
      amount: 2,
      type: "mill",
    },
    trigger: {
      event: "conquer",
      on: { controller: "friendly", location: "here" },
    },
    type: "triggered",
  },
];

export const minefield: BattlefieldCard = {
  abilities,
  cardNumber: 212,
  cardType: "battlefield",
  id: createCardId("sfd-212-221"),
  name: "Minefield",
  rarity: "uncommon",
  rulesText: "When you conquer here, put the top 2 cards of your Main Deck into your trash.",
  setId: "SFD",
};
