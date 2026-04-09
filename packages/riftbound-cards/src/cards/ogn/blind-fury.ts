import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const blindFury: SpellCard = {
  cardNumber: 25,
  cardType: "spell",
  domain: "fury",
  energyCost: 4,
  id: createCardId("ogn-025-298"),
  name: "Blind Fury",
  rarity: "rare",
  rulesText:
    "[Action] (Play on your turn or in showdowns.)\nEach opponent reveals the top card of their Main Deck. Choose one and banish it, then play it, ignoring its cost. Then recycle the rest.",
  setId: "OGN",
  timing: "action",
};
