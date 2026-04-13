import type { Ability } from "@tcg/riftbound-types";
import type { BattlefieldCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Sigil of the Storm — ogn-287-298
 *
 * "When you conquer here, you must recycle one of your runes."
 */
const abilities: Ability[] = [
  {
    effect: {
      amount: 1,
      from: "board",
      target: { controller: "friendly", type: "rune" },
      type: "recycle",
    },
    trigger: {
      event: "conquer",
      on: "controller",
    },
    type: "triggered",
  },
];

export const sigilOfTheStorm: BattlefieldCard = {
  abilities,
  cardNumber: 287,
  cardType: "battlefield",
  id: createCardId("ogn-287-298"),
  name: "Sigil of the Storm",
  rarity: "uncommon",
  rulesText:
    "When you conquer here, you must recycle one of your runes. (This doesn’t choose anything.)",
  setId: "OGN",
};
