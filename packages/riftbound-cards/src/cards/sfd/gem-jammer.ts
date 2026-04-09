import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const gemJammer: UnitCard = {
  cardNumber: 7,
  cardType: "unit",
  domain: "fury",
  energyCost: 2,
  id: createCardId("sfd-007-221"),
  might: 2,
  name: "Gem Jammer",
  rarity: "common",
  rulesText:
    "When you play me, give a unit [Ganking] this turn. (It can move from battlefield to battlefield.)",
  setId: "SFD",
};
