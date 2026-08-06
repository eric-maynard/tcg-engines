import type { Ability } from "@tcg/riftbound-types";
import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Bewitching Spirit — unl-121-219
 *
 * "When you play me, choose a player. They discard 1."
 *
 * rule-id: unl-121-219-choose-player — the controller must be prompted to
 * pick which player discards (self or opponent). Modeled as a `choice`
 * effect so the engine surfaces a `choose-mode` pending choice (rule 355.8)
 * instead of the parser's hard-coded opponent-only discard.
 */
const abilities: Ability[] = [
  {
    effect: {
      options: [
        {
          effect: { amount: 1, player: "opponent", type: "discard" },
          label: "Opponent discards 1",
        },
        {
          effect: { amount: 1, player: "self", type: "discard" },
          label: "You discard 1",
        },
      ],
      type: "choice",
    },
    trigger: { event: "play-self" },
    type: "triggered",
  },
];

export const bewitchingSpirit: UnitCard = {
  abilities,
  cardNumber: 121,
  cardType: "unit",
  domain: "chaos",
  energyCost: 3,
  id: createCardId("unl-121-219"),
  might: 2,
  name: "Bewitching Spirit",
  rarity: "common",
  rulesText: "When you play me, choose a player. They discard 1.",
  setId: "UNL",
};
