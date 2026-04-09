import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const scrapyardChampion: UnitCard = {
  cardNumber: 20,
  cardType: "unit",
  domain: "fury",
  energyCost: 5,
  id: createCardId("ogn-020-298"),
  might: 5,
  name: "Scrapyard Champion",
  rarity: "uncommon",
  rulesText:
    "[Legion] — When you play me, discard 2, then draw 2. (Get the effect if you've played another card this turn.)",
  setId: "OGN",
};
