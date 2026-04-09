import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const missFortuneCaptain: UnitCard = {
  cardNumber: 162,
  cardType: "unit",
  domain: "body",
  energyCost: 5,
  id: createCardId("ogn-162-298"),
  isChampion: true,
  might: 5,
  name: "Miss Fortune, Captain",
  rarity: "epic",
  rulesText:
    "[Accelerate] (You may pay [1][body] as an additional cost to have me enter ready.)\n[Ganking] (I can move from battlefield to battlefield.)\nThe first time I move each turn, you may ready something else that's exhausted.",
  setId: "OGN",
  tags: ["Miss Fortune"],
};
