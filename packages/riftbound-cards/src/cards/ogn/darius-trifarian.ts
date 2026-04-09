import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const dariusTrifarian: UnitCard = {
  cardNumber: 27,
  cardType: "unit",
  domain: "fury",
  energyCost: 5,
  id: createCardId("ogn-027-298"),
  isChampion: true,
  might: 5,
  name: "Darius, Trifarian",
  rarity: "rare",
  rulesText: "When you play your second card in a turn, give me +2 [Might] this turn and ready me.",
  setId: "OGN",
  tags: ["Darius"],
};
