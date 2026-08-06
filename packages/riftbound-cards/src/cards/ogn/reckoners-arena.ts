import type { Ability } from "@tcg/riftbound-types";
import type { BattlefieldCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Reckoner's Arena — ogn-286-298
 *
 * "When you hold here, activate the conquer effects of units here."
 *
 * rule 383.4.g.1: each unit here has its conquer effect activated — placed on
 * the chain as if it had just triggered, with only the "conquer" part of the
 * trigger condition treated as fulfilled. "Units here" is criteria-based
 * (rule 355.5.a), so `quantity: "all"` — nothing is chosen.
 */
const abilities: Ability[] = [
  {
    effect: {
      target: { controller: "friendly", location: "here", quantity: "all", type: "unit" },
      type: "activate-conquer-effects",
    },
    trigger: { event: "hold", on: "self" },
    type: "triggered",
  },
];

export const reckonersArena: BattlefieldCard = {
  abilities,
  cardNumber: 286,
  cardType: "battlefield",
  id: createCardId("ogn-286-298"),
  name: "Reckoner's Arena",
  rarity: "uncommon",
  rulesText: "When you hold here, activate the conquer effects of units here.",
  setId: "OGN",
};
