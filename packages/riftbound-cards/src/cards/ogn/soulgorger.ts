import type { Ability } from "@tcg/riftbound-types";
import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Soulgorger — ogn-196-298
 *
 * When you play me, you may play a unit from your trash, ignoring its
 * Energy cost. (You must still pay its Power cost.)
 */
const abilities: Ability[] = [
  {
    effect: {
      from: "trash",
      ignoreCost: "energy",
      // rule 355.5.b / 355.10.a — the unit is a TARGET of this trigger, chosen
      // when the trigger is finalized, so the descriptor must name the trash.
      target: { controller: "friendly", location: "trash", type: "unit" },
      type: "play",
    },
    optional: true,
    trigger: { event: "play-self" },
    type: "triggered",
  },
];

export const soulgorger: UnitCard = {
  abilities,
  cardNumber: 196,
  cardType: "unit",
  domain: "chaos",
  energyCost: 8,
  id: createCardId("ogn-196-298"),
  might: 5,
  name: "Soulgorger",
  rarity: "rare",
  rulesText:
    "When you play me, you may play a unit from your trash, ignoring its Energy cost. (You must still pay its Power cost.)",
  setId: "OGN",
};
