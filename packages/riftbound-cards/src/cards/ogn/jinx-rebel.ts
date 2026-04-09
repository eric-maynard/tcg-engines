import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const jinxRebel: UnitCard = {
  cardNumber: 202,
  cardType: "unit",
  domain: "chaos",
  energyCost: 5,
  id: createCardId("ogn-202-298"),
  isChampion: true,
  might: 5,
  name: "Jinx, Rebel",
  rarity: "epic",
  rulesText: "When you discard one or more cards, ready me and give me +1 [Might] this turn.",
  setId: "OGN",
  tags: ["Jinx"],
};
