import type { LegendCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const radiantDawn: LegendCard = {
  cardNumber: 261,
  cardType: "legend",
  championTag: "Leona",
  domain: ["calm", "order"],
  id: createCardId("ogn-261-298"),
  name: "Radiant Dawn",
  rarity: "rare",
  rulesText:
    "When you stun one or more enemy units, buff a friendly unit. (If it doesn't have a buff, it gets a +1 [Might] buff.)",
  setId: "OGN",
};
