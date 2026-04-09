import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const mobilize: SpellCard = {
  cardNumber: 134,
  cardType: "spell",
  domain: "body",
  energyCost: 2,
  id: createCardId("ogn-134-298"),
  name: "Mobilize",
  rarity: "common",
  rulesText: "Channel 1 rune exhausted. If you can't, draw 1.",
  setId: "OGN",
  timing: "action",
};
