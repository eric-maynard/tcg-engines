import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const royalEntourage: UnitCard = {
  cardNumber: 39,
  cardType: "unit",
  domain: "calm",
  energyCost: 3,
  id: createCardId("sfd-039-221"),
  might: 4,
  name: "Royal Entourage",
  rarity: "common",
  rulesText: "When you play me, ready or exhaust a legend.",
  setId: "SFD",
};
