import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const charm: SpellCard = {
  cardNumber: 43,
  cardType: "spell",
  domain: "calm",
  energyCost: 1,
  id: createCardId("ogn-043-298"),
  name: "Charm",
  rarity: "common",
  rulesText: "Move an enemy unit.",
  setId: "OGN",
  timing: "action",
};
