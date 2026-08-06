import type { Ability } from "@tcg/riftbound-types";
import type { GearCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * "When you ready a friendly unit, give it +1 [Might] this turn."
 *
 * rule 415.3: "it" is the unit that was readied (the trigger's source), not
 * this gear — the parser's bare "self" would buff the Haven itself.
 */
const abilities: Ability[] = [
  {
    effect: {
      amount: 1,
      duration: "turn",
      target: { type: "trigger-source" },
      type: "modify-might",
    },
    trigger: { event: "ready", on: { controller: "friendly", type: "unit" } },
    type: "triggered",
  },
];

export const piratesHaven: GearCard = {
  abilities,
  cardNumber: 143,
  cardType: "gear",
  domain: "body",
  energyCost: 3,
  id: createCardId("ogn-143-298"),
  name: "Pirate's Haven",
  rarity: "uncommon",
  rulesText: "When you ready a friendly unit, give it +1 [Might] this turn.",
  setId: "OGN",
};
