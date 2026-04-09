import type { RuneCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const furyRune: RuneCard = {
  cardNumber: 7,
  cardType: "rune",
  domain: "fury",
  id: createCardId("ogn-007-298"),
  isBasic: true,
  name: "Fury Rune",
  rarity: "common",
  setId: "OGN",
};
