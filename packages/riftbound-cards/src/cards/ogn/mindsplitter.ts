import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const mindsplitter: UnitCard = {
  cardNumber: 192,
  cardType: "unit",
  domain: "chaos",
  energyCost: 7,
  id: createCardId("ogn-192-298"),
  might: 7,
  name: "Mindsplitter",
  rarity: "rare",
  rulesText:
    "When you play me, choose an opponent. They reveal their hand. Choose a card from it, and they discard that card.",
  setId: "OGN",
};
