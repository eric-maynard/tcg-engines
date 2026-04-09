import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const primalStrength: SpellCard = {
  cardNumber: 154,
  cardType: "spell",
  domain: "body",
  energyCost: 4,
  id: createCardId("ogn-154-298"),
  name: "Primal Strength",
  rarity: "rare",
  rulesText: "[Action] (Play on your turn or in showdowns.)\nGive a unit +7 [Might] this turn.",
  setId: "OGN",
  timing: "action",
};
