import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const forecaster: UnitCard = {
  cardNumber: 65,
  cardType: "unit",
  domain: "mind",
  energyCost: 2,
  id: createCardId("sfd-065-221"),
  might: 2,
  name: "Forecaster",
  rarity: "common",
  rulesText:
    "Your Mechs have [Vision]. (When you play us, look at the top card of your Main Deck. You may recycle it.)",
  setId: "SFD",
};
