import type { LegendCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const keeperOfTheHammer: LegendCard = {
  cardNumber: 203,
  cardType: "legend",
  championTag: "Poppy",
  domain: ["body", "order"],
  id: createCardId("unl-203-219"),
  name: "Keeper of the Hammer",
  rarity: "rare",
  rulesText: "When you hold, gain 1 XP.\nSpend 3 XP, [Exhaust]: Draw 1.",
  setId: "UNL",
};
