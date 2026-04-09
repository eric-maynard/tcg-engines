import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const harpoonSquad: UnitCard = {
  cardNumber: 137,
  cardType: "unit",
  domain: "chaos",
  energyCost: 4,
  id: createCardId("sfd-137-221"),
  might: 4,
  name: "Harpoon Squad",
  rarity: "uncommon",
  rulesText: "When I move from a battlefield, give me +2 [Might] this turn.",
  setId: "SFD",
};
