import type { RuneCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const mindRune: RuneCard = {
  cardNumber: 89,
  cardType: "rune",
  domain: "mind",
  id: createCardId("ogn-089-298"),
  isBasic: true,
  name: "Mind Rune",
  rarity: "common",
  setId: "OGN",
};
