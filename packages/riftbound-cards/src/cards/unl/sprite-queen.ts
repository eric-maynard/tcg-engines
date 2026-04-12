import type { Ability } from "@tcg/riftbound-types";
import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Sprite Queen — unl-084-219
 *
 * When you play me or at the start of your Beginning Phase, play a
 * ready 3 [Might] Sprite unit token with [Temporary] to your base.
 */
const spriteTokenEffect = {
  location: "base" as const,
  ready: true,
  token: {
    keywords: ["Temporary"],
    might: 3,
    name: "Sprite",
    type: "unit" as const,
  },
  type: "create-token" as const,
};

const abilities: Ability[] = [
  {
    effect: spriteTokenEffect,
    trigger: { event: "play-self" },
    type: "triggered",
  },
  {
    effect: spriteTokenEffect,
    trigger: {
      event: "beginning-phase",
      on: "controller",
      timing: "at",
    },
    type: "triggered",
  },
];

export const spriteQueen: UnitCard = {
  abilities,
  cardNumber: 84,
  cardType: "unit",
  domain: "mind",
  energyCost: 7,
  id: createCardId("unl-084-219"),
  might: 6,
  name: "Sprite Queen",
  rarity: "rare",
  rulesText:
    "When you play me or at the start of your Beginning Phase, play a ready 3 [Might] Sprite unit token with [Temporary] to your base. (Kill them at the start of their controller's next Beginning Phase, before scoring.)",
  setId: "UNL",
};
