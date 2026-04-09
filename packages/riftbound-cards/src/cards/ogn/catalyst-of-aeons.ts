import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const catalystOfAeons: SpellCard = {
  cardNumber: 138,
  cardType: "spell",
  domain: "body",
  energyCost: 4,
  id: createCardId("ogn-138-298"),
  name: "Catalyst of Aeons",
  rarity: "uncommon",
  rulesText: "Channel 2 runes exhausted. If you couldn't channel 2 runes this way, draw 1.",
  setId: "OGN",
  timing: "action",
};
