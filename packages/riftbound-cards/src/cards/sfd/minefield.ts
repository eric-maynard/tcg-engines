import type { Ability } from "@tcg/riftbound-types";
import type { BattlefieldCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Minefield — sfd-212-221 (Battlefield)
 *
 * When you conquer here, put the top 2 cards of your Main Deck into
 * your trash.
 *
 * Approximated as a triggered look that discards (recycles to trash)
 * the top 2 cards. Engine "mill" semantics are represented via
 * look->recycle-to-trash once implemented; for now the ability object
 * captures the intent with a best-effort look-then sequence.
 */
const abilities: Ability[] = [
  {
    effect: {
      amount: 2,
      from: "deck",
      then: { recycle: "rest" },
      type: "look",
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
