import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const renataGlascIndustrialist: UnitCard = {
  cardNumber: 171,
  cardType: "unit",
  domain: "order",
  energyCost: 4,
  id: createCardId("sfd-171-221"),
  isChampion: true,
  might: 4,
  name: "Renata Glasc, Industrialist",
  rarity: "rare",
  rulesText: "Your tokens enter ready.",
  setId: "SFD",
  tags: ["Renata Glasc"],
};
