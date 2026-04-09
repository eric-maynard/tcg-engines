import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const nocturneHorrifying: UnitCard = {
  cardNumber: 194,
  cardType: "unit",
  domain: "chaos",
  energyCost: 4,
  id: createCardId("ogn-194-298"),
  isChampion: true,
  might: 4,
  name: "Nocturne, Horrifying",
  rarity: "rare",
  rulesText:
    "[Ganking] (I can move from battlefield to battlefield.)\nAs you look at or reveal me from the top of your deck, you may banish me. If you do, you may play me for [rainbow].",
  setId: "OGN",
  tags: ["Nocturne"],
};
