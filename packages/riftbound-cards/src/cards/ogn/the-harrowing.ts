import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const theHarrowing: SpellCard = {
  cardNumber: 198,
  cardType: "spell",
  domain: "chaos",
  energyCost: 6,
  id: createCardId("ogn-198-298"),
  name: "The Harrowing",
  rarity: "rare",
  rulesText:
    "Play a unit from your trash, ignoring its Energy cost. (You must still pay its Power cost.)",
  setId: "OGN",
  timing: "action",
};
