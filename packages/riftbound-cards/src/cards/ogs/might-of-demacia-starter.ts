import type { LegendCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const mightOfDemaciaStarter: LegendCard = {
  cardNumber: 23,
  cardType: "legend",
  championTag: "Garen",
  domain: ["body", "order"],
  id: createCardId("ogs-023-024"),
  name: "Might of Demacia - Starter",
  rarity: "rare",
  rulesText: "When you conquer, if you have 4+ units at that battlefield, draw 2.",
  setId: "OGS",
};
