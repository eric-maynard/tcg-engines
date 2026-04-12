import type { Ability } from "@tcg/riftbound-types";
import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Pit Crew — ogn-091-298
 *
 * When you play a gear, ready me.
 */
const abilities: Ability[] = [
  {
    effect: { target: "self", type: "ready" },
    trigger: {
      event: "play-gear",
      on: { cardType: "gear", controller: "friendly" },
    },
    type: "triggered",
  },
];

export const pitCrew: UnitCard = {
  abilities,
  cardNumber: 91,
  cardType: "unit",
  domain: "mind",
  energyCost: 3,
  id: createCardId("ogn-091-298"),
  might: 3,
  name: "Pit Crew",
  rarity: "common",
  rulesText: "When you play a gear, ready me.",
  setId: "OGN",
};
