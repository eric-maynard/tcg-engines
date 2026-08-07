import type { Ability } from "@tcg/riftbound-types";
import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Monch — unl-035-219
 *
 * "If an opponent controls a stunned unit, I cost [2] less and enter ready."
 *
 * Both halves ride on one condition (rule 108.2 — only an OPPONENT's stunned
 * unit counts). Modeled as two statics sharing that gate: a self
 * cost-reduction (rule 356.4 — applied while determining the total cost) and
 * the conditional EntersReady grant (rule 364.3.a).
 */
const CONDITION = {
  target: { controller: "enemy", filter: "stunned", type: "unit" },
  type: "opponent-controls",
} as const;

const abilities: Ability[] = [
  {
    condition: CONDITION,
    effect: {
      amount: 2,
      target: "self",
      type: "cost-reduction",
    },
    type: "static",
  },
  {
    condition: {
      target: { controller: "enemy", filter: "stunned", type: "unit" },
      type: "opponent-controls",
    },
    effect: {
      keyword: "EntersReady",
      target: "self",
      type: "grant-keyword",
    },
    type: "static",
  },
];

export const monch: UnitCard = {
  abilities,
  cardNumber: 35,
  cardType: "unit",
  domain: "calm",
  energyCost: 6,
  id: createCardId("unl-035-219"),
  might: 6,
  name: "Monch",
  rarity: "common",
  rulesText: "If an opponent controls a stunned unit, I cost [2] less and enter ready.",
  setId: "UNL",
};
