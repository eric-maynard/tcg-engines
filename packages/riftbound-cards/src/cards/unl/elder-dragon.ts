import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const elderDragon: UnitCard = {
  cardNumber: 118,
  cardType: "unit",
  domain: "body",
  energyCost: 12,
  id: createCardId("unl-118-219"),
  might: 10,
  name: "Elder Dragon",
  rarity: "epic",
  rulesText:
    "Any amount of your damage is enough to kill enemy units.\nWhen you play me, choose up to one enemy unit at each location. Deal 1 to them.",
  setId: "UNL",
};
