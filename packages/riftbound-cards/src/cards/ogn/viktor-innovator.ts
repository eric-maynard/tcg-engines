import type { Ability } from "@tcg/riftbound-types";
import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";
import { TOKEN_PRESETS } from "@tcg/riftbound-types";

/**
 * Viktor, Innovator — ogn-117-298
 *
 * When you play a card on an opponent's turn, play a 1 [Might] Recruit
 * unit token in your base.
 */
const abilities: Ability[] = [
  {
    effect: {
      location: "base",
      token: TOKEN_PRESETS.RECRUIT,
      type: "create-token",
    },
    trigger: {
      event: "play-card",
      on: { controller: "friendly" },
      restrictions: [{ type: "during-turn", whose: "opponent" }],
    },
    type: "triggered",
  },
];

export const viktorInnovator: UnitCard = {
  abilities,
  cardNumber: 117,
  cardType: "unit",
  domain: "mind",
  energyCost: 4,
  id: createCardId("ogn-117-298"),
  isChampion: true,
  might: 3,
  name: "Viktor, Innovator",
  rarity: "rare",
  rulesText:
    "When you play a card on an opponent's turn, play a 1 [Might] Recruit unit token in your base.",
  setId: "OGN",
  tags: ["Viktor"],
};
