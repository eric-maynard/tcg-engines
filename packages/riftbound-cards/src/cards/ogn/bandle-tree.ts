import type { Ability } from "@tcg/riftbound-types";
import type { BattlefieldCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Bandle Tree — ogn-278-298 (Battlefield)
 *
 * You may hide an additional card here.
 *
 * Modeled as a static ability whose `increase-hidden-capacity` effect is
 * applied once during game setup by `applyBattlefieldPermanentEffects`.
 * That pass bumps this battlefield's `hiddenCapacityBonus` by the
 * `amount`, so the hide-card move validation permits `1 + bonus` hidden
 * cards per player at this battlefield.
 */
const abilities: Ability[] = [
  {
    effect: {
      amount: 1,
      type: "increase-hidden-capacity",
    },
    type: "static",
  },
];

export const bandleTree: BattlefieldCard = {
  abilities,
  cardNumber: 278,
  cardType: "battlefield",
  id: createCardId("ogn-278-298"),
  name: "Bandle Tree",
  rarity: "uncommon",
  rulesText: "You may hide an additional card here.",
  setId: "OGN",
};
