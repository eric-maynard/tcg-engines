import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const fallingComet: SpellCard = {
  cardNumber: 85,
  cardType: "spell",
  domain: "mind",
  energyCost: 5,
  id: createCardId("ogn-085-298"),
  name: "Falling Comet",
  rarity: "common",
  rulesText: "[Action] (Play on your turn or in showdowns.)\nDeal 6 to a unit at a battlefield.",
  setId: "OGN",
  timing: "action",
};
