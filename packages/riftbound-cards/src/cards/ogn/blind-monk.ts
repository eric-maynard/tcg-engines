import type { LegendCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const blindMonk: LegendCard = {
  cardNumber: 257,
  cardType: "legend",
  championTag: "Lee Sin",
  domain: ["calm", "body"],
  id: createCardId("ogn-257-298"),
  name: "Blind Monk",
  rarity: "rare",
  rulesText:
    "[1], [Exhaust]: Buff a friendly unit. (If it doesn't have a buff, it gets a +1 [Might] buff.)",
  setId: "OGN",
};
