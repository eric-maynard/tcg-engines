import type { RuneCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const calmRune: RuneCard = {
  cardNumber: 42,
  cardType: "rune",
  domain: "calm",
  id: createCardId("ogn-042-298"),
  isBasic: true,
  name: "Calm Rune",
  rarity: "common",
  setId: "OGN",
};
