import type { Ability, Target } from "@tcg/riftbound-types";
import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * "Deal 2 to a unit at a battlefield. If you control a facedown card, deal 4
 * to it instead." — one caster-chosen target either way (rule 355.8), so the
 * descriptor is hoisted onto the conditional and both branches damage the
 * bound unit. rule 811.1: a facedown card is a board object you control, and
 * lives in its own `facedown-<bf>` zone.
 */
const damageTarget: Target = { location: "battlefield", type: "unit" };

const abilities: Ability[] = [
  {
    effect: {
      condition: {
        comparison: { gte: 1 },
        target: { controller: "friendly", location: "facedown", type: "card" },
        type: "count",
      },
      else: { amount: 2, target: damageTarget, type: "damage" },
      target: damageTarget,
      then: { amount: 4, target: damageTarget, type: "damage" },
      type: "conditional",
    },
    timing: "action",
    type: "spell",
  },
];

export const monsterHarpoon: SpellCard = {
  abilities,
  cardNumber: 14,
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  id: createCardId("unl-014-219"),
  name: "Monster Harpoon",
  rarity: "uncommon",
  rulesText:
    "[Action] (Play on your turn or in showdowns.)\nDeal 2 to a unit at a battlefield. If you control a facedown card, deal 4 to it instead.",
  setId: "UNL",
  timing: "action",
};
