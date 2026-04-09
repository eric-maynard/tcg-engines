import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const isolate: SpellCard = {
  cardNumber: 124,
  cardType: "spell",
  domain: "chaos",
  energyCost: 2,
  id: createCardId("unl-124-219"),
  name: "Isolate",
  rarity: "common",
  rulesText:
    "Move an enemy unit from a battlefield to its base. Then, if there's an enemy unit alone at that battlefield, draw 1.",
  setId: "UNL",
  timing: "action",
};
