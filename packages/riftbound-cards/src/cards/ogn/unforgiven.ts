import type { LegendCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const unforgiven: LegendCard = {
  cardNumber: 259,
  cardType: "legend",
  championTag: "Yasuo",
  domain: ["calm", "chaos"],
  id: createCardId("ogn-259-298"),
  name: "Unforgiven",
  rarity: "rare",
  rulesText: "[2], [Exhaust]: Move a friendly unit to or from its base.",
  setId: "OGN",
};
