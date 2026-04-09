import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const legionQuartermaster: UnitCard = {
  cardNumber: 44,
  cardType: "unit",
  domain: "calm",
  energyCost: 3,
  id: createCardId("sfd-044-221"),
  might: 4,
  name: "Legion Quartermaster",
  rarity: "uncommon",
  rulesText: "As an additional cost to play me, return a friendly gear to its owner's hand.",
  setId: "SFD",
};
