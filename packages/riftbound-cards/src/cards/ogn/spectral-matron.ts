import type { Ability } from "@tcg/riftbound-types";
import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Spectral Matron — ogn-226-298
 *
 * When you play me, you may play a unit costing no more than [3] and no
 * more than [rainbow] from your trash, ignoring its cost.
 *
 * rule 206: the cost bounds compare the printed cost — Energy <= 3 AND at
 * most one Power pip ([rainbow]).
 */
const abilities: Ability[] = [
  {
    effect: {
      from: "trash",
      ignoreCost: true,
      // rule 355.5.b / 355.10.a (ruling 64025589c9493414) — the trash is a PUBLIC
      // zone, so the unit is a TARGET of this trigger: it is named as the trigger
      // is finalized on the chain (383.3.b) and the opponent reacts knowing it,
      // instead of being picked on resolution. Same shape as ogn-196-298.
      target: {
        controller: "friendly",
        filter: [{ energyCost: { lte: 3 } }, { powerCost: { lte: 1 } }],
        location: "trash",
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
