import type { Ability } from "@tcg/riftbound-types";
import type { BattlefieldCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Obelisk of Power — ogn-284-298 (Battlefield)
 *
 * At the start of each player's first Beginning Phase, that player
 * channels 1 rune.
 *
 * Approximated as a beginning-phase trigger that channels 1 rune. The
 * "first Beginning Phase" restriction is represented by a once-per-game
 * trigger restriction.
 */
const abilities: Ability[] = [
  {
    effect: { amount: 1, type: "channel" },
    trigger: {
      event: "beginning-phase",
      on: "any-player",
      restrictions: [{ type: "once-per-game" }],
      timing: "at",
    },
    type: "triggered",
  },
];

export const obeliskOfPower: BattlefieldCard = {
  abilities,
  cardNumber: 284,
  cardType: "battlefield",
  id: createCardId("ogn-284-298"),
  name: "Obelisk of Power",
  rarity: "uncommon",
  rulesText: "At the start of each player's first Beginning Phase, that player channels 1 rune.",
  setId: "OGN",
};
