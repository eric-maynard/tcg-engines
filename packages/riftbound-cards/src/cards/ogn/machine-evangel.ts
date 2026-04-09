import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const machineEvangel: UnitCard = {
  cardNumber: 239,
  cardType: "unit",
  domain: "order",
  energyCost: 5,
  id: createCardId("ogn-239-298"),
  might: 4,
  name: "Machine Evangel",
  rarity: "rare",
  rulesText:
    "[Deathknell] — Play three 1 [Might] Recruit unit tokens into your base. (When I die, get the effect.)",
  setId: "OGN",
};
