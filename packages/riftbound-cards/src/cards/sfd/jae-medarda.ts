import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const jaeMedarda: UnitCard = {
  cardNumber: 142,
  cardType: "unit",
  domain: "chaos",
  energyCost: 5,
  id: createCardId("sfd-142-221"),
  might: 5,
  name: "Jae Medarda",
  rarity: "rare",
  rulesText: "When you choose me with a spell, draw 1.",
  setId: "SFD",
};
