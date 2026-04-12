import type { Ability } from "@tcg/riftbound-types";
import type { Effect } from "@tcg/riftbound-types/abilities/effect-types";
import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Thrill of the Hunt — unl-184-219
 *
 * "[Reaction] Banish a friendly unit, then its owner plays it to any
 *  battlefield, ignoring its cost."
 *
 * Modeled as a sequence: banish a friendly unit, then play the pending-value
 * card to a battlefield, ignoring cost.
 */
const abilities: Ability[] = [
  {
    effect: {
      effects: [
        {
          target: { controller: "friendly", type: "unit" },
          type: "banish",
        },
        {
          ignoreCost: true,
          target: { type: "pending-value" },
          toLocation: { battlefield: "any" },
          type: "play",
        } as unknown as Effect,
      ],
      pendingValue: { source: 0 },
      type: "sequence",
    },
    timing: "reaction",
    type: "spell",
  },
];

export const thrillOfTheHunt: SpellCard = {
  abilities,
  cardNumber: 184,
  cardType: "spell",
  domain: ["fury", "body"],
  energyCost: 2,
  id: createCardId("unl-184-219"),
  name: "Thrill of the Hunt",
  rarity: "epic",
  rulesText:
    "[Reaction] (Play any time, even before spells and abilities resolve.)\nBanish a friendly unit, then its owner plays it to any battlefield, ignoring its cost.",
  setId: "UNL",
  timing: "reaction",
};
