import type { Ability } from "@tcg/riftbound-types";
import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Convergent Mutation — ogn-108-298 (Reaction spell)
 *
 * Choose a friendly unit. This turn, increase its Might to the
 * Might of another friendly unit.
 *
 * rule 477.3.b — "increase to" is one-way: the chosen unit rises to the
 * reference unit's Might for the turn, the reference unit is untouched, and
 * nothing ever decreases.
 */
const abilities: Ability[] = [
  {
    effect: {
      duration: "turn",
      target1: { controller: "friendly", type: "unit" },
      target2: { controller: "friendly", type: "unit" },
      type: "increase-might-to",
    },
    timing: "reaction",
    type: "spell",
  },
];

export const convergentMutation: SpellCard = {
  abilities,
  cardNumber: 108,
  cardType: "spell",
  domain: "mind",
  energyCost: 2,
  id: createCardId("ogn-108-298"),
  name: "Convergent Mutation",
  rarity: "rare",
  rulesText:
    "[Reaction] (Play any time, even before spells and abilities resolve.)\nChoose a friendly unit. This turn, increase its Might to the Might of another friendly unit.",
  setId: "OGN",
  timing: "reaction",
};
