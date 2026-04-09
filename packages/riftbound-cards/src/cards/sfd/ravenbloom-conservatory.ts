import type { BattlefieldCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const ravenbloomConservatory: BattlefieldCard = {
  cardNumber: 215,
  cardType: "battlefield",
  id: createCardId("sfd-215-221"),
  name: "Ravenbloom Conservatory",
  rarity: "uncommon",
  rulesText:
    "When you defend here, reveal the top card of your Main Deck. If it's a spell, put it in your hand. Otherwise, recycle it.",
  setId: "SFD",
};
