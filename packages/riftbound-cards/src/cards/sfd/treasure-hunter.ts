import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const treasureHunter: UnitCard = {
  cardNumber: 130,
  cardType: "unit",
  domain: "chaos",
  energyCost: 2,
  id: createCardId("sfd-130-221"),
  might: 1,
  name: "Treasure Hunter",
  rarity: "common",
  rulesText: "When I move, play a Gold gear token exhausted.",
  setId: "SFD",
};
