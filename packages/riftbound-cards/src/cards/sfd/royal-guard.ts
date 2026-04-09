import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const royalGuard: UnitCard = {
  cardNumber: 157,
  cardType: "unit",
  domain: "order",
  energyCost: 4,
  id: createCardId("sfd-157-221"),
  might: 2,
  name: "Royal Guard",
  rarity: "common",
  rulesText: "When you play me, play a 2 [Might] Sand Soldier unit token here.",
  setId: "SFD",
};
