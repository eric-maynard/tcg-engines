import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const recruitDe: UnitCard = {
  cardNumber: 271,
  cardType: "unit",
  id: createCardId("ogn-271-298"),
  isToken: true,
  might: 1,
  name: "Recruit (DE)",
  rarity: "common",
  setId: "OGN",
  // rule 187.1: the 1 [Might] Recruit token carries the Recruit tag (185.2.c).
  tags: ["Recruit"],
};
