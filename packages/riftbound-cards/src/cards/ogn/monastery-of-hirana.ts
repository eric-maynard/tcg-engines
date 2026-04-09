import type { BattlefieldCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const monasteryOfHirana: BattlefieldCard = {
  cardNumber: 282,
  cardType: "battlefield",
  id: createCardId("ogn-282-298"),
  name: "Monastery of Hirana",
  rarity: "uncommon",
  rulesText: "When you conquer here, you may spend a buff to draw 1.",
  setId: "OGN",
};
