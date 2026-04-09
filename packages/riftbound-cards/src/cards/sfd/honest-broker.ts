import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const honestBroker: UnitCard = {
  cardNumber: 155,
  cardType: "unit",
  domain: "order",
  energyCost: 2,
  id: createCardId("sfd-155-221"),
  might: 2,
  name: "Honest Broker",
  rarity: "common",
  rulesText: "[Deathknell] — Play a Gold gear token exhausted. (When I die, get the effect.)",
  setId: "SFD",
};
