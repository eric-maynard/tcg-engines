import type { Ability } from "@tcg/riftbound-types";
import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Raging Firebrand — ogn-031-298
 *
 * When you play me, the next spell you play this turn costs [5] less.
 *
 * Modelled as a triggered cost-reduction via grant-keyword with a
 * virtual "NextSpellCostReduction" modifier keyed on the controller.
 * Engine support for this modifier is pending; the ability structure
 * captures the intent.
 */
const abilities: Ability[] = [
  {
    effect: {
      duration: "turn",
      keyword: "NextSpellCostReduction",
      target: "controller",
      type: "grant-keyword",
      value: 5,
    },
    trigger: { event: "play-self" },
    type: "triggered",
  },
];

export const ragingFirebrand: UnitCard = {
  abilities,
  cardNumber: 31,
  cardType: "unit",
  domain: "fury",
  energyCost: 6,
  id: createCardId("ogn-031-298"),
  might: 4,
  name: "Raging Firebrand",
  rarity: "rare",
  rulesText: "When you play me, the next spell you play this turn costs [5] less.",
  setId: "OGN",
};
