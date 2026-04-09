import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const leonaZealot: UnitCard = {
  cardNumber: 79,
  cardType: "unit",
  domain: "calm",
  energyCost: 6,
  id: createCardId("ogn-079-298"),
  isChampion: true,
  might: 6,
  name: "Leona, Zealot",
  rarity: "epic",
  rulesText:
    "If an opponent's score is within 3 points of the Victory Score, I enter ready.\nStunned enemy units here have -8 [Might], to a minimum of 1 [Might].",
  setId: "OGN",
  tags: ["Leona"],
};
