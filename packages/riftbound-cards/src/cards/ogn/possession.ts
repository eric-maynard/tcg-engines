import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const possession: SpellCard = {
  cardNumber: 203,
  cardType: "spell",
  domain: "chaos",
  energyCost: 8,
  id: createCardId("ogn-203-298"),
  name: "Possession",
  rarity: "epic",
  rulesText:
    "[Action] (Play on your turn or in showdowns.)\nChoose an enemy unit at a battlefield. Take control of it and recall it. (Send it to your base. This isn't a move.)",
  setId: "OGN",
  timing: "action",
};
