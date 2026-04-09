import type { LegendCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const ladyOfLuminosityStarter: LegendCard = {
  cardNumber: 21,
  cardType: "legend",
  championTag: "Lux",
  domain: ["mind", "order"],
  id: createCardId("ogs-021-024"),
  name: "Lady of Luminosity - Starter",
  rarity: "rare",
  rulesText: "When you play a spell that costs [5] or more, draw 1.",
  setId: "OGS",
};
