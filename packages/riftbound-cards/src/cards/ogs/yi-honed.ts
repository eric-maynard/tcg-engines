import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const yiHoned: UnitCard = {
  cardNumber: 9,
  cardType: "unit",
  domain: "body",
  energyCost: 7,
  id: createCardId("ogs-009-024"),
  isChampion: true,
  might: 6,
  name: "Yi, Honed",
  rarity: "epic",
  rulesText: "[Ganking] (I can move from battlefield to battlefield.)\nI enter ready.",
  setId: "OGS",
  tags: ["Yi"],
};
