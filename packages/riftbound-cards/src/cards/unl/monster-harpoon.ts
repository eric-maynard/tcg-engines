import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const monsterHarpoon: SpellCard = {
  cardNumber: 14,
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  id: createCardId("unl-014-219"),
  name: "Monster Harpoon",
  rarity: "uncommon",
  rulesText:
    "[Action] (Play on your turn or in showdowns.)\nDeal 2 to a unit at a battlefield. If you control a facedown card, deal 4 to it instead.",
  setId: "UNL",
  timing: "action",
};
