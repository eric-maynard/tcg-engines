import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const sandshifter: UnitCard = {
  cardNumber: 158,
  cardType: "unit",
  domain: "order",
  energyCost: 5,
  id: createCardId("sfd-158-221"),
  might: 6,
  name: "Sandshifter",
  rarity: "common",
  rulesText: "When you play me, kill an enemy unit with 3 [Might] or less.",
  setId: "SFD",
};
