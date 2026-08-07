import type { Ability } from "@tcg/riftbound-types";
import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Yordle Explorer — sfd-100-221
 *
 * When you play a card with Power cost [rainbow][rainbow] or more, draw 1.
 *
 * rule 206.1: "Power cost" is the card's PRINTED Power cost, so additional
 * costs, Accelerate pips and optional riders never push a card over the
 * threshold. The parser drops the "with Power cost … or more" clause, so the
 * gate is spelled out here as a `played-power-cost` trigger condition.
 */
const abilities: Ability[] = [
  {
    condition: { amount: 2, type: "played-power-cost" },
    effect: { amount: 1, type: "draw" },
    trigger: { event: "play-card", on: "controller" },
    type: "triggered",
  },
];

export const yordleExplorer: UnitCard = {
  abilities,
  cardNumber: 100,
  cardType: "unit",
  domain: "body",
  energyCost: 4,
  id: createCardId("sfd-100-221"),
  might: 4,
  name: "Yordle Explorer",
  rarity: "common",
  rulesText: "When you play a card with Power cost [rainbow][rainbow] or more, draw 1.",
  setId: "SFD",
};
