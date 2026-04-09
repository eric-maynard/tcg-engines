import type { LegendCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const gloomist: LegendCard = {
  cardNumber: 193,
  cardType: "legend",
  championTag: "Vex",
  domain: ["calm", "chaos"],
  id: createCardId("unl-193-219"),
  name: "Gloomist",
  rarity: "rare",
  rulesText: "When you or an ally hold, you may exhaust me to draw 1.",
  setId: "UNL",
};
