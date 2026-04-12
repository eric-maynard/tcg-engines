import type { Ability } from "@tcg/riftbound-types";
import type { BattlefieldCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * The Arena's Greatest — ogn-290-298 (Battlefield)
 *
 * At the start of each player's first Beginning Phase, that player
 * gains 1 point.
 */
const abilities: Ability[] = [
  {
    effect: { amount: 1, type: "score" },
    trigger: {
      event: "beginning-phase",
      on: "any-player",
      restrictions: [{ type: "once-per-game" }],
      timing: "at",
    },
    type: "triggered",
  },
];

export const theArenasGreatest: BattlefieldCard = {
  abilities,
  cardNumber: 290,
  cardType: "battlefield",
  id: createCardId("ogn-290-298"),
  name: "The Arena's Greatest",
  rarity: "uncommon",
  rulesText: "At the start of each player's first Beginning Phase, that player gains 1 point.",
  setId: "OGN",
};
