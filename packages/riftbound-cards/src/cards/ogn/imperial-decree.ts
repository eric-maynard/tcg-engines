import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const imperialDecree: SpellCard = {
  cardNumber: 221,
  cardType: "spell",
  domain: "order",
  energyCost: 5,
  id: createCardId("ogn-221-298"),
  name: "Imperial Decree",
  rarity: "uncommon",
  rulesText:
    "[Action] (Play on your turn or in showdowns.)\nWhen any unit takes damage this turn, kill it.",
  setId: "OGN",
  timing: "action",
};
