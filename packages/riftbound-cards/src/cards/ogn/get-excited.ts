import type { Ability } from "@tcg/riftbound-types";
import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Get Excited! — ogn-008-298
 *
 * "Discard 1. Deal its Energy cost as damage to a unit at a battlefield."
 *
 * rule 355.8 — "a unit at a battlefield" is a caster-chosen play-time target,
 * so the damaged unit rides on the discard effect's descriptor; the discard
 * prompt's `then` clause deals the damage once the discarded card is known
 * (rule 206 — "its Energy cost", the Power cost is ignored).
 */
const abilities: Ability[] = [
  {
    effect: {
      amount: 1,
      target: { location: "battlefield", type: "unit" },
      then: {
        amount: { cost: { type: "trigger-source" } },
        target: { location: "battlefield", type: "unit" },
        type: "damage",
      },
      type: "discard",
    },
    timing: "action",
    type: "spell",
  },
] as unknown as Ability[];

export const getExcited: SpellCard = {
  abilities,
  cardNumber: 8,
  cardType: "spell",
  domain: "fury",
  energyCost: 2,
  id: createCardId("ogn-008-298"),
  name: "Get Excited!",
  rarity: "common",
  rulesText:
    "[Action] (Play on your turn or in showdowns.)\nDiscard 1. Deal its Energy cost as damage to a unit at a battlefield. (Ignore its Power cost.)",
  setId: "OGN",
  timing: "action",
};
