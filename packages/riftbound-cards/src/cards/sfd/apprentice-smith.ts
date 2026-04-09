import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const apprenticeSmith: UnitCard = {
  cardNumber: 41,
  cardType: "unit",
  domain: "calm",
  energyCost: 2,
  id: createCardId("sfd-041-221"),
  might: 2,
  name: "Apprentice Smith",
  rarity: "uncommon",
  rulesText:
    "When I move, reveal the top card of your Main Deck. If it's a gear, draw it. Otherwise, recycle it.",
  setId: "SFD",
};
