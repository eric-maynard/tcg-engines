import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const soulgorger: UnitCard = {
  cardNumber: 196,
  cardType: "unit",
  domain: "chaos",
  energyCost: 8,
  id: createCardId("ogn-196-298"),
  might: 5,
  name: "Soulgorger",
  rarity: "rare",
  rulesText:
    "When you play me, you may play a unit from your trash, ignoring its Energy cost. (You must still pay its Power cost.)",
  setId: "OGN",
};
