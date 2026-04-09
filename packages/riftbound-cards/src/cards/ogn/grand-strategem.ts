import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const grandStrategem: SpellCard = {
  cardNumber: 233,
  cardType: "spell",
  domain: "order",
  energyCost: 6,
  id: createCardId("ogn-233-298"),
  name: "Grand Strategem",
  rarity: "rare",
  rulesText:
    "[Action] (Play on your turn or in showdowns.)\nGive friendly units +5 [Might] this turn.",
  setId: "OGN",
  timing: "action",
};
