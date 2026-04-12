import type { Ability } from "@tcg/riftbound-types";
import type { BattlefieldCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Abandoned Hall — unl-205-219 (Battlefield)
 *
 * When a player plays a spell, they may give a unit they control here
 * +1 [Might] this turn.
 */
const abilities: Ability[] = [
  {
    effect: {
      amount: 1,
      duration: "turn",
      target: {
        location: "here",
        type: "unit",
      },
      type: "modify-might",
    },
    optional: true,
    trigger: {
      event: "play-spell",
      on: { cardType: "spell", controller: "any" },
    },
    type: "triggered",
  },
];

export const abandonedHall: BattlefieldCard = {
  abilities,
  cardNumber: 205,
  cardType: "battlefield",
  id: createCardId("unl-205-219"),
  name: "Abandoned Hall",
  rarity: "uncommon",
  rulesText:
    "When a player plays a spell, they may give a unit they control here +1 [Might] this turn.",
  setId: "UNL",
};
