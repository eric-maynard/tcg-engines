import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const fioraPeerless: UnitCard = {
  cardNumber: 110,
  cardType: "unit",
  domain: "body",
  energyCost: 3,
  id: createCardId("sfd-110-221"),
  isChampion: true,
  might: 3,
  name: "Fiora, Peerless",
  rarity: "rare",
  rulesText: "When I attack or defend one on one, double my Might this combat.",
  setId: "SFD",
  tags: ["Fiora"],
};
