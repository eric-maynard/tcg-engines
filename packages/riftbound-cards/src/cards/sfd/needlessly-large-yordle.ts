import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const needlesslyLargeYordle: UnitCard = {
  cardNumber: 55,
  cardType: "unit",
  domain: "calm",
  energyCost: 10,
  id: createCardId("sfd-055-221"),
  might: 5,
  name: "Needlessly Large Yordle",
  rarity: "rare",
  rulesText:
    "[Shield 5] (+5 [Might] while I'm a defender.)\n[Tank] (I must be assigned combat damage first.)\nI cost [2][calm] less for each point you scored from holding this turn.",
  setId: "SFD",
};
