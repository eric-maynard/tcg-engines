import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const viDestructive: UnitCard = {
  cardNumber: 36,
  cardType: "unit",
  domain: "fury",
  energyCost: 2,
  id: createCardId("ogn-036-298"),
  isChampion: true,
  might: 3,
  name: "Vi, Destructive",
  rarity: "rare",
  rulesText:
    "[Ganking] (I can move from battlefield to battlefield.)\nRecycle 1 from your trash: Give me +1 [Might] this turn.",
  setId: "OGN",
  tags: ["Vi"],
};
