import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const yetiBrawler: UnitCard = {
  cardNumber: 18,
  cardType: "unit",
  domain: "fury",
  energyCost: 6,
  id: createCardId("unl-018-219"),
  might: 6,
  name: "Yeti Brawler",
  rarity: "uncommon",
  rulesText:
    "When I conquer, if you assigned 3 or more excess damage, play two Gold gear tokens exhausted. (They have &quot;[Reaction][&gt;] Kill this, [Exhaust]: [Add] [rainbow].&quot;)",
  setId: "UNL",
};
