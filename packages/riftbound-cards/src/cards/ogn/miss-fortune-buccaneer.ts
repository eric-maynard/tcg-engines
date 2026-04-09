import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const missFortuneBuccaneer: UnitCard = {
  cardNumber: 193,
  cardType: "unit",
  domain: "chaos",
  energyCost: 4,
  id: createCardId("ogn-193-298"),
  isChampion: true,
  might: 4,
  name: "Miss Fortune, Buccaneer",
  rarity: "rare",
  rulesText:
    "You may play me to an open battlefield.\nFriendly units may be played to open battlefields.",
  setId: "OGN",
  tags: ["Miss Fortune"],
};
