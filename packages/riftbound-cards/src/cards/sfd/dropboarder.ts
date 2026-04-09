import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const dropboarder: UnitCard = {
  cardNumber: 72,
  cardType: "unit",
  domain: "mind",
  energyCost: 4,
  id: createCardId("sfd-072-221"),
  might: 4,
  name: "Dropboarder",
  rarity: "uncommon",
  rulesText: "When you play me, if you control two or more gear, ready me.",
  setId: "SFD",
};
