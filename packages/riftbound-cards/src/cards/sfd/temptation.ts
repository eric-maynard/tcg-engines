import type { Ability } from "@tcg/riftbound-types";
import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Temptation — sfd-129-221
 *
 * "Move an enemy unit to a location where there's a unit with the same
 * controller." rule 449.1 — the destination clause restricts where the unit may
 * go: a place its OWN controller already occupies. The generic `to: "choose"`
 * the parser produces would offer every location, so the restriction is named
 * explicitly here (`effects/move.ts` reads it).
 */
const abilities: Ability[] = [
  {
    effect: {
      target: { controller: "enemy", type: "unit" },
      to: "same-controller-unit",
      type: "move",
    },
    repeat: { energy: 2 },
    timing: "standard",
    type: "spell",
  },
];

export const temptation: SpellCard = {
  abilities,
  cardNumber: 129,
  cardType: "spell",
  domain: "chaos",
  energyCost: 2,
  id: createCardId("sfd-129-221"),
  name: "Temptation",
  rarity: "common",
  rulesText:
    "[Repeat] [2] (You may pay the additional cost to repeat this spell's effect.)\nMove an enemy unit to a location where there's a unit with the same controller.",
  setId: "SFD",
  timing: "action",
};
