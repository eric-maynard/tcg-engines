import type { BattlefieldCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const targonsPeak: BattlefieldCard = {
  cardNumber: 289,
  cardType: "battlefield",
  id: createCardId("ogn-289-298"),
  name: "Targon's Peak",
  rarity: "uncommon",
  rulesText: "When you conquer here, ready up to 2 runes at the end of this turn.",
  setId: "OGN",
};
