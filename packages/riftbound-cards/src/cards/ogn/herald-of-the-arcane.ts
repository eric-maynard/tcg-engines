import type { LegendCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const heraldOfTheArcane: LegendCard = {
  cardNumber: 265,
  cardType: "legend",
  championTag: "Viktor",
  domain: ["mind", "order"],
  id: createCardId("ogn-265-298"),
  name: "Herald of the Arcane",
  rarity: "rare",
  rulesText: "[1], [Exhaust]: Play a 1 [Might] Recruit unit token.",
  setId: "OGN",
};
