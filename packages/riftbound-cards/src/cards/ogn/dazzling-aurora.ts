import type { Ability } from "@tcg/riftbound-types";
import type { GearCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Dazzling Aurora — ogn-160-298
 *
 * "At the end of your turn, reveal cards from the top of your Main Deck
 *  until you reveal a unit and banish it. Play it, ignoring its cost, and
 *  recycle the rest."
 *
 * Rule 354.2: modeled as a single reveal-until-unit effect. The engine's
 * `reveal` handler performs the banish → play-ignoring-cost → recycle-rest
 * flow atomically, so no follow-up sequence steps are needed here.
 */
const abilities: Ability[] = [
  {
    effect: {
      amount: 1,
      from: "deck",
      type: "reveal",
      until: "unit",
    },
    trigger: {
      event: "end-of-turn",
      on: "controller",
      timing: "at",
    },
    type: "triggered",
  },
];

export const dazzlingAurora: GearCard = {
  abilities,
  cardNumber: 160,
  cardType: "gear",
  domain: "body",
  energyCost: 9,
  id: createCardId("ogn-160-298"),
  name: "Dazzling Aurora",
  rarity: "epic",
  rulesText:
    "At the end of your turn, reveal cards from the top of your Main Deck until you reveal a unit and banish it. Play it, ignoring its cost, and recycle the rest.",
  setId: "OGN",
};
