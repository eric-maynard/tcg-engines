import type { BattlefieldCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const zaunWarrens: BattlefieldCard = {
  cardNumber: 298,
  cardType: "battlefield",
  id: createCardId("ogn-298-298"),
  name: "Zaun Warrens",
  rarity: "uncommon",
  rulesText: "When you conquer here, discard 1, then draw 1.",
  setId: "OGN",
};
