import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const salvage: SpellCard = {
  cardNumber: 224,
  cardType: "spell",
  domain: "order",
  energyCost: 2,
  id: createCardId("ogn-224-298"),
  name: "Salvage",
  rarity: "uncommon",
  rulesText: "[Action] (Play on your turn or in showdowns.)\nYou may kill up to one gear. Draw 1.",
  setId: "OGN",
  timing: "action",
};
