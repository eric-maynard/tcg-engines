import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const sneakyDeckhand: UnitCard = {
  cardNumber: 176,
  cardType: "unit",
  domain: "chaos",
  energyCost: 3,
  id: createCardId("ogn-176-298"),
  might: 2,
  name: "Sneaky Deckhand",
  rarity: "common",
  rulesText: "You may play me to an open battlefield.",
  setId: "OGN",
};
