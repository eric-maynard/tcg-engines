import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const sabotage: SpellCard = {
  cardNumber: 156,
  cardType: "spell",
  domain: "body",
  energyCost: 1,
  id: createCardId("ogn-156-298"),
  name: "Sabotage",
  rarity: "rare",
  rulesText:
    "Choose an opponent. They reveal their hand. Choose a non-unit card from it, and recycle that card.",
  setId: "OGN",
  timing: "action",
};
