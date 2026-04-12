import type { Ability } from "@tcg/riftbound-types";
import type { BattlefieldCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Forgotten Monument — sfd-209-221 (Battlefield)
 *
 * Players can't score here until their third turn.
 *
 * Modeled as a static `prevent-score` effect gated by a
 * `turn-count-at-least` condition on `threshold: 3`. The engine's
 * scoring-rules helper `canPlayerScoreAtBattlefield` reads the ability
 * at scoring time and blocks scoring while the active player's
 * `turnsTaken` is below the threshold. A player's first turn is
 * `turnsTaken === 1`, so scoring unlocks on that player's third turn.
 */
const abilities: Ability[] = [
  {
    condition: {
      threshold: 3,
      type: "turn-count-at-least",
    },
    effect: {
      type: "prevent-score",
    },
    type: "static",
  },
];

export const forgottenMonument: BattlefieldCard = {
  abilities,
  cardNumber: 209,
  cardType: "battlefield",
  id: createCardId("sfd-209-221"),
  name: "Forgotten Monument",
  rarity: "uncommon",
  rulesText: "Players can't score here until their third turn.",
  setId: "SFD",
};
