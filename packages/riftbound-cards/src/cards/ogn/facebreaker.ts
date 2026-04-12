import type { Ability } from "@tcg/riftbound-types";
import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Facebreaker — ogn-220-298 (Action spell)
 *
 * [Hidden]
 * Stun a friendly unit and an enemy unit at the same battlefield.
 */
const abilities: Ability[] = [
  { keyword: "Hidden", type: "keyword" },
  {
    effect: {
      effects: [
        {
          target: {
            controller: "friendly",
            location: "battlefield",
            type: "unit",
          },
          type: "stun",
        },
        {
          target: {
            controller: "enemy",
            location: "same",
            type: "unit",
          },
          type: "stun",
        },
      ],
      type: "sequence",
    },
    timing: "action",
    type: "spell",
  },
];

export const facebreaker: SpellCard = {
  abilities,
  cardNumber: 220,
  cardType: "spell",
  domain: "order",
  energyCost: 2,
  id: createCardId("ogn-220-298"),
  name: "Facebreaker",
  rarity: "uncommon",
  rulesText:
    "[Hidden] (Hide now for [rainbow] to react with later for [energy_0].)\n[Action] (Play on your turn or in showdowns.)\nStun a friendly unit and an enemy unit at the same battlefield. (They don't deal combat damage this turn.)",
  setId: "OGN",
  timing: "action",
};
