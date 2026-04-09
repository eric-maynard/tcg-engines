import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const ivernFriendToAll: UnitCard = {
  cardNumber: 177,
  cardType: "unit",
  domain: "order",
  energyCost: 6,
  id: createCardId("unl-177-219"),
  isChampion: true,
  might: 6,
  name: "Ivern, Friend to All",
  rarity: "epic",
  rulesText:
    "As you play me, choose Bird, Cat, Dog, or Poro. I gain that tag.\nWhen I conquer or hold, score 1 point if your units have all of the following tags among them — Bird, Cat, Dog, and Poro.",
  setId: "UNL",
  tags: ["Ivern"],
};
