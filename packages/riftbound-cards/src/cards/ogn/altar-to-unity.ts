import type { Ability } from "@tcg/riftbound-types";
import type { BattlefieldCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";
import { TOKEN_PRESETS } from "@tcg/riftbound-types";

/**
 * Altar to Unity — ogn-275-298 (Battlefield)
 *
 * When you hold here, play a 1 [Might] Recruit unit token in your base.
 */
const abilities: Ability[] = [
  {
    effect: {
      location: "base",
      token: TOKEN_PRESETS.RECRUIT,
      type: "create-token",
    },
    trigger: {
      event: "hold",
      on: { controller: "friendly", location: "here" },
    },
    type: "triggered",
  },
];

export const altarToUnity: BattlefieldCard = {
  abilities,
  cardNumber: 275,
  cardType: "battlefield",
  id: createCardId("ogn-275-298"),
  name: "Altar to Unity",
  rarity: "uncommon",
  rulesText: "When you hold here, play a 1 [Might] Recruit unit token in your base.",
  setId: "OGN",
};
