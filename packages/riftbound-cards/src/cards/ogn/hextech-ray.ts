import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const hextechRay: SpellCard = {
  cardNumber: 9,
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  id: createCardId("ogn-009-298"),
  name: "Hextech Ray",
  rarity: "common",
  rulesText: "[Action] (Play on your turn or in showdowns.)\nDeal 3 to a unit at a battlefield.",
  setId: "OGN",
  timing: "action",
};
