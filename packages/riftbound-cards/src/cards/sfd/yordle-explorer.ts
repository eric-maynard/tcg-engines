import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const yordleExplorer: UnitCard = {
  cardNumber: 100,
  cardType: "unit",
  domain: "body",
  energyCost: 4,
  id: createCardId("sfd-100-221"),
  might: 4,
  name: "Yordle Explorer",
  rarity: "common",
  rulesText: "When you play a card with Power cost [rainbow][rainbow] or more, draw 1.",
  setId: "SFD",
};
