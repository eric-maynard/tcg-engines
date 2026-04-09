import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const saiScout: UnitCard = {
  cardNumber: 174,
  cardType: "unit",
  domain: "chaos",
  energyCost: 6,
  id: createCardId("ogn-174-298"),
  might: 5,
  name: "Sai Scout",
  rarity: "common",
  rulesText:
    "[Vision] (When you play me, look at the top card of your Main Deck. You may recycle it.)\nYou may play me to an open battlefield.",
  setId: "OGN",
};
