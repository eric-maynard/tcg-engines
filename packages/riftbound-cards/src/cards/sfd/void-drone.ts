import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const voidDrone: UnitCard = {
  cardNumber: 10,
  cardType: "unit",
  domain: "fury",
  energyCost: 3,
  id: createCardId("sfd-010-221"),
  might: 3,
  name: "Void Drone",
  rarity: "common",
  rulesText: "I cost [2] less to play from anywhere other than your hand.",
  setId: "SFD",
};
