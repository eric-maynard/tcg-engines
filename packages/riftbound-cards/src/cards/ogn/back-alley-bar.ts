import type { BattlefieldCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const backAlleyBar: BattlefieldCard = {
  cardNumber: 277,
  cardType: "battlefield",
  id: createCardId("ogn-277-298"),
  name: "Back-Alley Bar",
  rarity: "uncommon",
  rulesText: "When a unit moves from here, give it +1 [Might] this turn.",
  setId: "OGN",
};
