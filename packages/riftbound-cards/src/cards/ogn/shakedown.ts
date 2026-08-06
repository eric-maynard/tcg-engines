import type { Ability } from "@tcg/riftbound-types";
import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Shakedown — ogn-033-298
 *
 * "Choose an enemy unit. Deal 6 to it unless its controller has you draw 2."
 *
 * rule 355.10.e — the "unless" clause hands the decision to the chosen unit's
 * controller: either the caster draws 2, or the unit is dealt 6.
 */
const abilities: Ability[] = [
  {
    effect: {
      options: [
        {
          effect: { amount: 2, type: "draw" },
          label: "Have them draw 2",
        },
        {
          effect: { amount: 6, type: "damage" },
          label: "Deal 6 to it",
        },
      ],
      player: "target-controller",
      target: { controller: "enemy", location: "anywhere", type: "unit" },
      type: "choice",
    },
    timing: "reaction",
    type: "spell",
  },
];

export const shakedown: SpellCard = {
  abilities,
  cardNumber: 33,
  cardType: "spell",
  domain: "fury",
  energyCost: 2,
  id: createCardId("ogn-033-298"),
  name: "Shakedown",
  rarity: "rare",
  rulesText:
    "[Reaction] (Play any time, even before spells and abilities resolve.)\nChoose an enemy unit. Deal 6 to it unless its controller has you draw 2.",
  setId: "OGN",
  timing: "reaction",
};
