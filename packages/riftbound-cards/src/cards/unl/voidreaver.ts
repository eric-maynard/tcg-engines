import type { LegendCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const voidreaver: LegendCard = {
  cardNumber: 201,
  cardType: "legend",
  championTag: "Kha'Zix",
  domain: ["body", "chaos"],
  id: createCardId("unl-201-219"),
  name: "Voidreaver",
  rarity: "rare",
  rulesText:
    "When you win a combat, gain 1 XP.\nSpend 1 XP, [Exhaust]: [Buff] a unit.\nSpend 2 XP, [Exhaust]: Move an exhausted friendly unit from a battlefield to its base.",
  setId: "UNL",
};
