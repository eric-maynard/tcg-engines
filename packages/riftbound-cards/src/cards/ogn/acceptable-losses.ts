import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const acceptableLosses: SpellCard = {
  cardNumber: 179,
  cardType: "spell",
  domain: "chaos",
  energyCost: 1,
  id: createCardId("ogn-179-298"),
  name: "Acceptable Losses",
  rarity: "uncommon",
  rulesText: "[Action] (Play on your turn or in showdowns.)\nEach player kills one of their gear.",
  setId: "OGN",
  timing: "action",
};
