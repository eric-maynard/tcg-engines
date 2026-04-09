import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const lecturingYordle: UnitCard = {
  cardNumber: 87,
  cardType: "unit",
  domain: "mind",
  energyCost: 3,
  id: createCardId("ogn-087-298"),
  might: 2,
  name: "Lecturing Yordle",
  rarity: "common",
  rulesText: "[Tank] (I must be assigned combat damage first.)\nWhen you play me, draw 1.",
  setId: "OGN",
};
