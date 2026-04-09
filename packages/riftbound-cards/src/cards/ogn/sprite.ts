import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const sprite: UnitCard = {
  cardNumber: 274,
  cardType: "unit",
  id: createCardId("ogn-274-298"),
  isToken: true,
  might: 3,
  name: "Sprite",
  rarity: "common",
  rulesText: "[Temporary] (Kill me at the start of your Beginning Phase, before scoring.)",
  setId: "OGN",
};
