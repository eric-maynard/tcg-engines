import type { LegendCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const darkChildStarter: LegendCard = {
  cardNumber: 17,
  cardType: "legend",
  championTag: "Annie",
  domain: ["fury", "chaos"],
  id: createCardId("ogs-017-024"),
  name: "Dark Child - Starter",
  rarity: "rare",
  rulesText: "At the end of your turn, ready up to 2 runes.",
  setId: "OGS",
};
