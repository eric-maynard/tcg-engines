import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const divineJudgment: SpellCard = {
  cardNumber: 244,
  cardType: "spell",
  domain: "order",
  energyCost: 7,
  id: createCardId("ogn-244-298"),
  name: "Divine Judgment",
  rarity: "epic",
  rulesText:
    "Each player chooses 2 units, 2 gear, 2 runes, and 2 cards in their hands. Recycle the rest.",
  setId: "OGN",
  timing: "action",
};
