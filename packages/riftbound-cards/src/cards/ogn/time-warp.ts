import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const timeWarp: SpellCard = {
  cardNumber: 122,
  cardType: "spell",
  domain: "mind",
  energyCost: 10,
  id: createCardId("ogn-122-298"),
  name: "Time Warp",
  rarity: "epic",
  rulesText: "Take a turn after this one. Banish this.",
  setId: "OGN",
  timing: "action",
};
