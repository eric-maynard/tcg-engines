import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const ribbonDancer: UnitCard = {
  cardNumber: 38,
  cardType: "unit",
  domain: "calm",
  energyCost: 3,
  id: createCardId("sfd-038-221"),
  might: 3,
  name: "Ribbon Dancer",
  rarity: "common",
  rulesText: "When I move to a battlefield, give another friendly unit +1 [Might] this turn.",
  setId: "SFD",
};
