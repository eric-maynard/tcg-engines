import type { Ability } from "@tcg/riftbound-types";
import type { GearCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Unlicensed Armory — ogn-023-298
 *
 * "Discard 1, [Exhaust]: Choose a friendly unit. The next time it would die
 *  this turn, you may pay [fury] to heal it, exhaust it, and recall it
 *  instead."
 *
 * Modeled as an activated ability that installs a single-fire replacement
 * on the chosen unit.
 */
const abilities: Ability[] = [
  {
    cost: { discard: 1, exhaust: true },
    effect: {
      condition: {
        cost: { power: ["fury"] },
        type: "pay-cost",
      },
      duration: "turn",
      replacement: {
        effects: [
          {
            amount: "all",
            target: { type: "trigger-source" },
            type: "heal",
          },
          {
            target: { type: "trigger-source" },
            type: "exhaust",
          },
          {
            target: { type: "trigger-source" },
            type: "recall",
          },
        ],
        type: "sequence",
      },
      replaces: "die",
      target: { controller: "friendly", type: "unit" },
      type: "replacement",
    } as unknown as import("@tcg/riftbound-types/abilities/effect-types").Effect,
    type: "activated",
  },
];

export const unlicensedArmory: GearCard = {
  abilities,
  cardNumber: 23,
  cardType: "gear",
  domain: "fury",
  energyCost: 2,
  id: createCardId("ogn-023-298"),
  name: "Unlicensed Armory",
  rarity: "uncommon",
  rulesText:
    "Discard 1, [Exhaust]: Choose a friendly unit. The next time it would die this turn, you may pay [fury] to heal it, exhaust it, and recall it instead. (Send it to base. This isn't a move.)",
  setId: "OGN",
};
