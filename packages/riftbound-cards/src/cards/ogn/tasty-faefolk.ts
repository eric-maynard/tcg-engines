import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const tastyFaefolk: UnitCard = {
  cardNumber: 75,
  cardType: "unit",
  domain: "calm",
  energyCost: 7,
  id: createCardId("ogn-075-298"),
  might: 6,
  name: "Tasty Faefolk",
  rarity: "rare",
  rulesText:
    "[Accelerate] (You may pay [1][calm] as an additional cost to have me enter ready.)\n[Deathknell] — Channel 2 runes exhausted and draw 1. (When I die, get the effect.)",
  setId: "OGN",
};
