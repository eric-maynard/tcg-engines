import type { Ability } from "@tcg/riftbound-types";
import type { GearCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Chemtech Cask — sfd-063-221
 *
 * "When you play a spell on an opponent's turn, you may exhaust me to play
 *  a Gold gear token exhausted."
 */
const abilities: Ability[] = [
  {
    condition: { cost: { exhaust: true }, type: "pay-cost" },
    effect: {
      ready: false,
      token: { name: "Gold", type: "gear" },
      type: "create-token",
    },
    optional: true,
    trigger: {
      event: "play-spell",
      on: "controller",
      restrictions: [{ type: "during-turn", whose: "opponent" }],
    },
    type: "triggered",
  },
];

export const chemtechCask: GearCard = {
  abilities,
  cardNumber: 63,
  cardType: "gear",
  domain: "mind",
  energyCost: 1,
  id: createCardId("sfd-063-221"),
  name: "Chemtech Cask",
  rarity: "common",
  rulesText:
    "When you play a spell on an opponent's turn, you may exhaust me to play a Gold gear token exhausted.",
  setId: "SFD",
};
