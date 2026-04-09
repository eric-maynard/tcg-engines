import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const laurentBladekeeper: UnitCard = {
  cardNumber: 96,
  cardType: "unit",
  domain: "body",
  energyCost: 3,
  id: createCardId("sfd-096-221"),
  might: 3,
  name: "Laurent Bladekeeper",
  rarity: "common",
  rulesText: "Ganking (I can move from battlefield to battlefield.)",
  setId: "SFD",
};
