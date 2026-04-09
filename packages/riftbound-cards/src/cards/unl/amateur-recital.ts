import type { BattlefieldCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const amateurRecital: BattlefieldCard = {
  cardNumber: 207,
  cardType: "battlefield",
  id: createCardId("unl-207-219"),
  name: "Amateur Recital",
  rarity: "uncommon",
  rulesText: "When you hold here, you may move a unit at a battlefield to its base.",
  setId: "UNL",
};
