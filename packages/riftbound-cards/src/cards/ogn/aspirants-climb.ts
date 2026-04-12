import type { Ability } from "@tcg/riftbound-types";
import type { BattlefieldCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Aspirant's Climb — ogn-276-298 (Battlefield)
 *
 * Increase the points needed to win the game by 1.
 *
 * Modeled as a static ability whose `increase-victory-score` effect is
 * applied once during game setup by `applyBattlefieldPermanentEffects`.
 * That pass bumps every player's `victoryScoreModifier` by the `amount`,
 * so the effective win threshold becomes `state.victoryScore + 1`.
 */
const abilities: Ability[] = [
  {
    effect: {
      amount: 1,
      type: "increase-victory-score",
    },
    type: "static",
  },
];

export const aspirantsClimb: BattlefieldCard = {
  abilities,
  cardNumber: 276,
  cardType: "battlefield",
  id: createCardId("ogn-276-298"),
  name: "Aspirant's Climb",
  rarity: "uncommon",
  rulesText: "Increase the points needed to win the game by 1.",
  setId: "OGN",
};
