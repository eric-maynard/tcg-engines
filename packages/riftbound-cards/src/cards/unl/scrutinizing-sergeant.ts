import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const scrutinizingSergeant: UnitCard = {
  cardNumber: 157,
  cardType: "unit",
  domain: "order",
  energyCost: 6,
  id: createCardId("unl-157-219"),
  might: 6,
  name: "Scrutinizing Sergeant",
  rarity: "common",
  rulesText: "When you play me, gain 1 XP for each friendly unit.",
  setId: "UNL",
};
