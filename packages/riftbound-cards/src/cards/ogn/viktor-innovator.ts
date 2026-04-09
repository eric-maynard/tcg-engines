import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const viktorInnovator: UnitCard = {
  cardNumber: 117,
  cardType: "unit",
  domain: "mind",
  energyCost: 4,
  id: createCardId("ogn-117-298"),
  isChampion: true,
  might: 3,
  name: "Viktor, Innovator",
  rarity: "rare",
  rulesText:
    "When you play a card on an opponent's turn, play a 1 [Might] Recruit unit token in your base.",
  setId: "OGN",
  tags: ["Viktor"],
};
