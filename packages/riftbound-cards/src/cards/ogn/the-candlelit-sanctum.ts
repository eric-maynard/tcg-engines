import type { Ability } from "@tcg/riftbound-types";
import type { BattlefieldCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * The Candlelit Sanctum — ogn-291-298 (Battlefield)
 *
 * When you conquer here, look at the top two cards of your Main Deck.
 * You may recycle one or both of them. Put those you don't back in any
 * order.
 *
 * Trigger: conquer at this battlefield
 * Effect: look 2, optionally recycle any, rest go back on top.
 */
const abilities: Ability[] = [
  {
    effect: {
      amount: 2,
      from: "deck",
      then: { recycle: "rest" },
      type: "look",
    },
    trigger: { event: "conquer", on: "controller" },
    type: "triggered",
  },
];

export const theCandlelitSanctum: BattlefieldCard = {
  abilities,
  cardNumber: 291,
  cardType: "battlefield",
  id: createCardId("ogn-291-298"),
  name: "The Candlelit Sanctum",
  rarity: "uncommon",
  rulesText:
    "When you conquer here, look at the top two cards of your Main Deck. You may recycle one or both of them. Put those you don't back in any order.",
  setId: "OGN",
};
