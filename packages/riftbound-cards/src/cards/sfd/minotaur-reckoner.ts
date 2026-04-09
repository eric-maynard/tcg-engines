import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const minotaurReckoner: UnitCard = {
  cardNumber: 14,
  cardType: "unit",
  domain: "fury",
  energyCost: 5,
  id: createCardId("sfd-014-221"),
  might: 5,
  name: "Minotaur Reckoner",
  rarity: "uncommon",
  rulesText: "Units can't move to base.",
  setId: "SFD",
};
