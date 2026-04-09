import type { BattlefieldCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const sigilOfTheStorm: BattlefieldCard = {
  cardNumber: 287,
  cardType: "battlefield",
  id: createCardId("ogn-287-298"),
  name: "Sigil of the Storm",
  rarity: "uncommon",
  rulesText:
    "When you conquer here, you must recycle one of your runes. (This doesn’t choose anything.)",
  setId: "OGN",
};
