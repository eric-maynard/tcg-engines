import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const keepersVerdict: SpellCard = {
  cardNumber: 204,
  cardType: "spell",
  domain: ["body", "order"],
  energyCost: 2,
  id: createCardId("unl-204-219"),
  name: "Keeper's Verdict",
  rarity: "epic",
  rulesText:
    "[Action] (Play on your turn or in showdowns.)\nChoose an enemy unit at a battlefield. Its owner places it on the top or bottom of their Main Deck.",
  setId: "UNL",
  timing: "action",
};
