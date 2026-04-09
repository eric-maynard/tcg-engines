import type { GearCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const treasureTrove: GearCard = {
  cardNumber: 186,
  cardType: "gear",
  domain: "chaos",
  energyCost: 2,
  id: createCardId("ogn-186-298"),
  name: "Treasure Trove",
  rarity: "uncommon",
  rulesText:
    "When this leaves the board, draw 1 and channel 1 rune exhausted.\n[chaos], [Exhaust]: Kill this.",
  setId: "OGN",
};
