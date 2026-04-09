import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const faeDragon: UnitCard = {
  cardNumber: 101,
  cardType: "unit",
  domain: "body",
  energyCost: 7,
  id: createCardId("sfd-101-221"),
  might: 7,
  name: "Fae Dragon",
  rarity: "uncommon",
  rulesText:
    "When you play me, buff up to four friendly units. (Give each a +1 [Might] buff if it doesn't have one.)\nWhen you spend a buff, play a Gold gear token exhausted.",
  setId: "SFD",
};
