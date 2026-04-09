import type { RuneCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const bodyRune: RuneCard = {
  cardNumber: 126,
  cardType: "rune",
  domain: "body",
  id: createCardId("ogn-126-298"),
  isBasic: true,
  name: "Body Rune",
  rarity: "common",
  setId: "OGN",
};
