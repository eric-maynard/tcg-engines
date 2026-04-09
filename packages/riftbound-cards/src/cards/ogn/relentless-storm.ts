import type { LegendCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const relentlessStorm: LegendCard = {
  cardNumber: 249,
  cardType: "legend",
  championTag: "Volibear",
  domain: ["fury", "body"],
  id: createCardId("ogn-249-298"),
  name: "Relentless Storm",
  rarity: "rare",
  rulesText:
    "When you play a [Mighty] unit, you may exhaust me to channel 1 rune exhausted. (A unit is Mighty while it has 5+ [Might].)",
  setId: "OGN",
};
