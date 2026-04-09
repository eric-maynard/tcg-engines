import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const factoryRecall: SpellCard = {
  cardNumber: 135,
  cardType: "spell",
  domain: "chaos",
  energyCost: 1,
  id: createCardId("sfd-135-221"),
  name: "Factory Recall",
  rarity: "uncommon",
  rulesText: "[Action] (Play on your turn or in showdowns.)\nReturn a gear to its owner's hand.",
  setId: "SFD",
  timing: "action",
};
