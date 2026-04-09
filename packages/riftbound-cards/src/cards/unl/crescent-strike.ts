import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const crescentStrike: SpellCard = {
  cardNumber: 72,
  cardType: "spell",
  domain: "mind",
  energyCost: 3,
  id: createCardId("unl-072-219"),
  name: "Crescent Strike",
  rarity: "uncommon",
  rulesText:
    "[Action] (Play on your turn or in showdowns.)\nChoose a battlefield and an enemy unit there. Deal 4 to that unit and 1 to each other enemy unit there.",
  setId: "UNL",
  timing: "action",
};
