import type { BattlefieldCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const reaversRow: BattlefieldCard = {
  cardNumber: 285,
  cardType: "battlefield",
  id: createCardId("ogn-285-298"),
  name: "Reaver's Row",
  rarity: "uncommon",
  rulesText: "When you defend here, you may move a friendly unit here to base.",
  setId: "OGN",
};
