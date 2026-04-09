import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const whirlwind: SpellCard = {
  cardNumber: 187,
  cardType: "spell",
  domain: "chaos",
  energyCost: 3,
  id: createCardId("ogn-187-298"),
  name: "Whirlwind",
  rarity: "uncommon",
  rulesText: "Starting with the next player, each player may return a unit to its owner's hand.",
  setId: "OGN",
  timing: "action",
};
