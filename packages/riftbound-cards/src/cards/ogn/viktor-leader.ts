import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const viktorLeader: UnitCard = {
  cardNumber: 246,
  cardType: "unit",
  domain: "order",
  energyCost: 4,
  id: createCardId("ogn-246-298"),
  isChampion: true,
  might: 4,
  name: "Viktor, Leader",
  rarity: "epic",
  rulesText:
    "When another non-Recruit unit you control dies, play a 1 [Might] Recruit unit token into your base.",
  setId: "OGN",
  tags: ["Viktor"],
};
