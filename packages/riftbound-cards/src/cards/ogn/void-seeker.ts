import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const voidSeeker: SpellCard = {
  cardNumber: 24,
  cardType: "spell",
  domain: "fury",
  energyCost: 3,
  id: createCardId("ogn-024-298"),
  name: "Void Seeker",
  rarity: "uncommon",
  rulesText:
    "[Action] (Play on your turn or in showdowns.)\nDeal 4 to a unit at a battlefield. Draw 1.",
  setId: "OGN",
  timing: "action",
};
