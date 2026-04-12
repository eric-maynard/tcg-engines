import type { Ability } from "@tcg/riftbound-types";
import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Walking Roost — unl-130-219
 *
 * [Deflect]
 * When you play me, choose an opponent. They play a 1 [Might] Bird
 * unit token with [Deflect].
 */
const abilities: Ability[] = [
  { keyword: "Deflect", type: "keyword", value: 1 },
  {
    effect: {
      location: "base",
      token: {
        keywords: ["Deflect"],
        might: 1,
        name: "Bird",
        type: "unit",
      },
      type: "create-token",
    },
    trigger: { event: "play-self" },
    type: "triggered",
  },
];

export const walkingRoost: UnitCard = {
  abilities,
  cardNumber: 130,
  cardType: "unit",
  domain: "chaos",
  energyCost: 5,
  id: createCardId("unl-130-219"),
  might: 6,
  name: "Walking Roost",
  rarity: "common",
  rulesText:
    "[Deflect] (Opponents must pay [rainbow] to choose me with a spell or ability.)\nWhen you play me, choose an opponent. They play a 1 [Might] Bird unit token with [Deflect].",
  setId: "UNL",
};
