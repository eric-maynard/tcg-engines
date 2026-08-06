import type { Ability } from "@tcg/riftbound-types";
import type { Effect } from "@tcg/riftbound-types/abilities/effect-types";
import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

// rule 356.2 — the optional "exhaust a friendly unit" is an additional COST
// chosen and paid as the spell is played (static `additional-cost-option`
// with an `exhaust` descriptor), not a resolve-time effect; the spell itself
// only reads whether it was paid.
const abilities: Ability[] = [
  {
    effect: {
      additionalCost: { exhaust: { controller: "friendly", type: "unit" } },
      optional: true,
      type: "additional-cost-option",
    } as unknown as Effect,
    type: "static",
  } as unknown as Ability,
  {
    effect: {
      condition: { type: "paid-additional-cost" },
      else: { amount: 1, type: "draw" },
      then: { amount: 2, type: "draw" },
      type: "conditional",
    } as unknown as Effect,
    timing: "reaction",
    type: "spell",
  },
];

export const meditation: SpellCard = {
  abilities,
  cardNumber: 48,
  cardType: "spell",
  domain: "calm",
  energyCost: 2,
  id: createCardId("ogn-048-298"),
  name: "Meditation",
  rarity: "common",
  rulesText:
    "[Reaction] (Play any time, even before spells and abilities resolve.)\nAs an additional cost to play this, you may exhaust a friendly unit. If you do, draw 2. Otherwise, draw 1.",
  setId: "OGN",
  timing: "reaction",
};
