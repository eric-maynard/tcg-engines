import type { Ability } from "@tcg/riftbound-types";
import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Viktor, Leader — ogn-246-298
 *
 * When another non-Recruit unit you control dies, play a 1 [Might]
 * Recruit unit token into your base.
 *
 * Trigger: death of a friendly unit (not self, not a Recruit token).
 * Effect: spawn a Recruit token at the controller's base.
 */
const abilities: Ability[] = [
  {
    effect: {
      location: "base",
      token: { might: 1, name: "Recruit", type: "unit" },
      type: "create-token",
    },
    trigger: {
      event: "die",
      on: {
        cardType: "unit",
        controller: "friendly",
        excludeSelf: true,
        tag: "not:Recruit",
      },
    },
    type: "triggered",
  },
];

export const viktorLeader: UnitCard = {
  abilities,
  cardNumber: 246,
  cardType: "unit",
  domain: "order",
  energyCost: 4,
  id: createCardId("ogn-246-298"),
  isChampion: true,
  might: 4,
  name: "Viktor, Leader",
  rarity: "epic",
  rulesText:
    "When another non-Recruit unit you control dies, play a 1 [Might] Recruit unit token into your base.",
  setId: "OGN",
  tags: ["Viktor"],
};
