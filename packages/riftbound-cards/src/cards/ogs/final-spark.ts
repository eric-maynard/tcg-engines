import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const finalSpark: SpellCard = {
  cardNumber: 22,
  cardType: "spell",
  domain: ["mind", "order"],
  energyCost: 8,
  id: createCardId("ogs-022-024"),
  name: "Final Spark",
  rarity: "epic",
  rulesText: "[Action] (Play on your turn or in showdowns.)\nDeal 8 to a unit.",
  setId: "OGS",
  timing: "action",
};
