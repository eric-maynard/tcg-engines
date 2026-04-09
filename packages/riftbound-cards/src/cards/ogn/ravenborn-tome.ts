import type { GearCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const ravenbornTome: GearCard = {
  cardNumber: 32,
  cardType: "gear",
  domain: "fury",
  energyCost: 3,
  id: createCardId("ogn-032-298"),
  name: "Ravenborn Tome",
  rarity: "rare",
  rulesText:
    "[Exhaust]: The next spell you play this turn deals 1 Bonus Damage. (Each instance of damage the spell deals is increased by 1.)",
  setId: "OGN",
};
