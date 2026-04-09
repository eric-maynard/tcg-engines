import type { RuneCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const orderRune: RuneCard = {
  cardNumber: 214,
  cardType: "rune",
  domain: "order",
  id: createCardId("ogn-214-298"),
  isBasic: true,
  name: "Order Rune",
  rarity: "common",
  setId: "OGN",
};
