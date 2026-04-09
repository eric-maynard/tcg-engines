import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const partyFavors: SpellCard = {
  cardNumber: 71,
  cardType: "spell",
  domain: "calm",
  energyCost: 3,
  id: createCardId("ogn-071-298"),
  name: "Party Favors",
  rarity: "rare",
  rulesText:
    "Each other player chooses Cards or Runes. For each player that chooses Cards, you and that player each draw 1. For each player that chooses Runes, you and that player each channel 1 rune exhausted.",
  setId: "OGN",
  timing: "action",
};
