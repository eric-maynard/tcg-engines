import type { BattlefieldCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const theDreamingTree: BattlefieldCard = {
  cardNumber: 292,
  cardType: "battlefield",
  id: createCardId("ogn-292-298"),
  name: "The Dreaming Tree",
  rarity: "uncommon",
  rulesText:
    "When a player chooses a friendly unit here with a spell for the first time each turn, they draw 1.",
  setId: "OGN",
};
