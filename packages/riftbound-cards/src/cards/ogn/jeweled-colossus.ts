import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const jeweledColossus: UnitCard = {
  cardNumber: 86,
  cardType: "unit",
  domain: "mind",
  energyCost: 5,
  id: createCardId("ogn-086-298"),
  might: 5,
  name: "Jeweled Colossus",
  rarity: "common",
  rulesText:
    "[Vision] (When you play me, look at the top card of your Main Deck. You may recycle it.)\n[Shield] (+1 [Might] while I'm a defender.)",
  setId: "OGN",
};
