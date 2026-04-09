import type { GearCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const scrapheap: GearCard = {
  cardNumber: 182,
  cardType: "gear",
  domain: "chaos",
  energyCost: 2,
  id: createCardId("ogn-182-298"),
  name: "Scrapheap",
  rarity: "uncommon",
  rulesText: "When this is played, discarded, or killed, draw 1.",
  setId: "OGN",
};
