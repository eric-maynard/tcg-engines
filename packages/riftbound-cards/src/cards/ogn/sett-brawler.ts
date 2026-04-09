import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const settBrawler: UnitCard = {
  cardNumber: 164,
  cardType: "unit",
  domain: "body",
  energyCost: 5,
  id: createCardId("ogn-164-298"),
  isChampion: true,
  might: 4,
  name: "Sett, Brawler",
  rarity: "epic",
  rulesText:
    "When I'm played and when I conquer, buff me. (If I don't have a buff, I get a +1 [Might] buff.)\nSpend my buff: Give me +4 [Might] this turn.",
  setId: "OGN",
  tags: ["Sett"],
};
