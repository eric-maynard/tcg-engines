import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const karmaChanneler: UnitCard = {
  cardNumber: 235,
  cardType: "unit",
  domain: "order",
  energyCost: 6,
  id: createCardId("ogn-235-298"),
  isChampion: true,
  might: 6,
  name: "Karma, Channeler",
  rarity: "rare",
  rulesText:
    "[Vision] (When you play me, look at the top card of your Main Deck. You may recycle it.)\nWhen you recycle one or more cards to your Main Deck, buff a friendly unit. (If it doesn't have a buff, it gets a +1 [Might] buff. Runes aren't cards.)",
  setId: "OGN",
  tags: ["Karma"],
};
