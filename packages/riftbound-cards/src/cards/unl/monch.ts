import type { Ability } from "@tcg/riftbound-types";
import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Monch — unl-035-219
 *
 * "If an opponent controls a stunned unit, I cost [2] less and enter ready."
 *
 * Modeled as a static that grants EntersReady when the condition is met.
 * The cost reduction isn't structurally expressible; we capture the
 * conditional EntersReady grant.
 */
const abilities: Ability[] = [
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
