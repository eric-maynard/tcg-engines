import type { Ability } from "@tcg/riftbound-types";
import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Black Market Broker — sfd-121-221
 *
 * "When you play a card from face down, play a Gold gear token exhausted."
 */
const abilities: Ability[] = [
  {
    effect: {
      ready: false,
      token: { name: "Gold", type: "gear" },
      type: "create-token",
    },
    trigger: {
      event: "play-from-hidden",
      on: "controller",
    },
    type: "triggered",
  },
];

export const blackMarketBroker: UnitCard = {
  abilities,
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
