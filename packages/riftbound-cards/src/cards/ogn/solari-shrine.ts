import type { GearCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const solariShrine: GearCard = {
  cardNumber: 72,
  cardType: "gear",
  domain: "calm",
  energyCost: 3,
  id: createCardId("ogn-072-298"),
  name: "Solari Shrine",
  rarity: "rare",
  rulesText: "When you kill a stunned enemy unit, you may exhaust this to draw 1.",
  setId: "OGN",
};
