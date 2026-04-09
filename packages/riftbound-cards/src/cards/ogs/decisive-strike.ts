import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const decisiveStrike: SpellCard = {
  cardNumber: 24,
  cardType: "spell",
  domain: ["body", "order"],
  energyCost: 5,
  id: createCardId("ogs-024-024"),
  name: "Decisive Strike",
  rarity: "epic",
  rulesText:
    "[Action] (Play on your turn or in showdowns.)\nGive friendly units +2 [Might] this turn.",
  setId: "OGS",
  timing: "action",
};
