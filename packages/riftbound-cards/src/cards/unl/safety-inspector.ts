import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const safetyInspector: UnitCard = {
  cardNumber: 164,
  cardType: "unit",
  domain: "order",
  energyCost: 5,
  id: createCardId("unl-164-219"),
  might: 3,
  name: "Safety Inspector",
  rarity: "uncommon",
  rulesText:
    "You may spend 3 XP as an additional cost to play me.\nWhen you play me, each player must kill one of their units. If you paid my additional cost, you don't kill a unit this way.",
  setId: "UNL",
};
