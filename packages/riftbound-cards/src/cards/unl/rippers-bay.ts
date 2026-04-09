import type { BattlefieldCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const rippersBay: BattlefieldCard = {
  cardNumber: 214,
  cardType: "battlefield",
  id: createCardId("unl-214-219"),
  name: "Ripper's Bay",
  rarity: "uncommon",
  rulesText:
    "When a unit here is returned to a player's hand, that player may pay [1] to channel 1 rune exhausted.",
  setId: "UNL",
};
