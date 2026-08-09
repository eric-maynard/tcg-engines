import type { Ability } from "@tcg/riftbound-types";
import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Sudden Storm — sfd-017-221 (Action spell)
 *
 * [Hidden]
 * Deal 2 to a unit at a battlefield. If it's attacking, deal 4 to it instead.
 */
// rule-id: sfd-017-221 — "deal 4 instead" replaces the 2 (never both); the
// parser split the pronoun chain into two unconditional damage steps.
const abilities: Ability[] = [
  { keyword: "Hidden", type: "keyword" },
  {
    effect: {
      condition: { type: "target-attacking" },
      else: {
        amount: 2,
        target: { location: "battlefield", type: "unit" },
        type: "damage",
      },
      target: { location: "battlefield", type: "unit" },
      then: {
        amount: 4,
        target: { location: "battlefield", type: "unit" },
        type: "damage",
      },
      type: "conditional",
    },
    timing: "action",
    type: "spell",
  },
] as unknown as Ability[];

export const suddenStorm: SpellCard = {
  abilities,
  cardNumber: 17,
  cardType: "spell",
  domain: "fury",
  energyCost: 3,
  id: createCardId("sfd-017-221"),
  name: "Sudden Storm",
  rarity: "uncommon",
  rulesText:
    "[Hidden] (Hide now for [rainbow] to react with later for [0].)\n[Action] (Play on your turn or in showdowns.)\nDeal 2 to a unit at a battlefield. If it's attacking, deal 4 to it instead.",
  setId: "SFD",
  timing: "action",
};
