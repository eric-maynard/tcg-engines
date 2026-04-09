import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const firestorm: SpellCard = {
  cardNumber: 2,
  cardType: "spell",
  domain: "fury",
  energyCost: 6,
  id: createCardId("ogs-002-024"),
  name: "Firestorm",
  rarity: "uncommon",
  rulesText: "Deal 3 to all enemy units at a battlefield.",
  setId: "OGS",
  timing: "action",
};
