import type { RuneCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const chaosRune: RuneCard = {
  cardNumber: 166,
  cardType: "rune",
  domain: "chaos",
  id: createCardId("ogn-166-298"),
  isBasic: true,
  name: "Chaos Rune",
  rarity: "common",
  setId: "OGN",
};
