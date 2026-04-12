import type { Ability } from "@tcg/riftbound-types";
import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Ava Achiever — ogn-107-298
 *
 * When I attack, you may pay [mind] to play a card with [Hidden] from
 * your hand, ignoring its cost. If it's a unit, play it here.
 */
const abilities: Ability[] = [
  {
    condition: {
      cost: { power: ["mind"] },
      type: "pay-cost",
    },
    effect: {
      from: "hand",
      ignoreCost: true,
      target: {
        controller: "friendly",
        filter: { keyword: "Hidden" },
        type: "card",
      },
      toLocation: "here",
      type: "play",
    },
    optional: true,
    trigger: { event: "attack", on: "self" },
    type: "triggered",
  },
];

export const avaAchiever: UnitCard = {
  abilities,
  cardNumber: 107,
  cardType: "unit",
  domain: "mind",
  energyCost: 5,
  id: createCardId("ogn-107-298"),
  might: 4,
  name: "Ava Achiever",
  rarity: "rare",
  rulesText:
    "When I attack, you may pay [mind] to play a card with [Hidden] from your hand, ignoring its cost. If it’s a unit, play it here.",
  setId: "OGN",
};
