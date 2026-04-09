import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const morbidReturn: SpellCard = {
  cardNumber: 170,
  cardType: "spell",
  domain: "chaos",
  energyCost: 2,
  id: createCardId("ogn-170-298"),
  name: "Morbid Return",
  rarity: "common",
  rulesText:
    "[Action] (Play on your turn or in showdowns.)\nReturn a unit from your trash to your hand.",
  setId: "OGN",
  timing: "action",
};
