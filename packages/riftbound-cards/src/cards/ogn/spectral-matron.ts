import type { Ability } from "@tcg/riftbound-types";
import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Spectral Matron — ogn-226-298
 *
 * When you play me, you may play a unit costing no more than [3] and no
 * more than [rainbow] from your trash, ignoring its cost.
 *
 * Approximated as play-from-trash with energyCost <= 3 filter (the
 * [rainbow] (1 power) upper bound is omitted — engine cost filter doesn't
 * yet express power-cost maxes).
 */
const abilities: Ability[] = [
  {
    effect: {
      from: "trash",
      ignoreCost: true,
      target: {
        controller: "friendly",
        filter: { energyCost: { lte: 3 } },
        type: "unit",
      },
      type: "play",
    },
    optional: true,
    trigger: { event: "play-self" },
    type: "triggered",
  },
];

export const spectralMatron: UnitCard = {
  abilities,
  cardNumber: 226,
  cardType: "unit",
  domain: "order",
  energyCost: 4,
  id: createCardId("ogn-226-298"),
  might: 4,
  name: "Spectral Matron",
  rarity: "uncommon",
  rulesText:
    "When you play me, you may play a unit costing no more than [3] and no more than [rainbow] from your trash, ignoring its cost.",
  setId: "OGN",
};
