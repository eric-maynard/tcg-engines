import type { LegendCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const wujuBladesmanStarter: LegendCard = {
  cardNumber: 19,
  cardType: "legend",
  championTag: "Yi",
  domain: ["calm", "body"],
  id: createCardId("ogs-019-024"),
  name: "Wuju Bladesman - Starter",
  rarity: "rare",
  rulesText: "While a friendly unit defends alone, it gets +2 [Might].",
  setId: "OGS",
};
