import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const blackMarketBroker: UnitCard = {
  cardNumber: 121,
  cardType: "unit",
  domain: "chaos",
  energyCost: 3,
  id: createCardId("sfd-121-221"),
  might: 3,
  name: "Black Market Broker",
  rarity: "common",
  rulesText: "When you play a card from face down, play a Gold gear token exhausted.",
  setId: "SFD",
};
