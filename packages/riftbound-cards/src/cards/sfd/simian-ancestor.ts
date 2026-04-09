import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const simianAncestor: UnitCard = {
  cardNumber: 47,
  cardType: "unit",
  domain: "calm",
  energyCost: 5,
  id: createCardId("sfd-047-221"),
  might: 5,
  name: "Simian Ancestor",
  rarity: "uncommon",
  rulesText: "When you buff me, ready me.",
  setId: "SFD",
};
