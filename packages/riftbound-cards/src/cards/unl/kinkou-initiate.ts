import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const kinkouInitiate: UnitCard = {
  cardNumber: 97,
  cardType: "unit",
  domain: "body",
  energyCost: 3,
  id: createCardId("unl-097-219"),
  might: 3,
  name: "Kinkou Initiate",
  rarity: "common",
  rulesText: "When you play me, draw 1 if your other units have total Might 5 or more.",
  setId: "UNL",
};
