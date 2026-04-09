import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const twistedFateGambler: UnitCard = {
  cardNumber: 200,
  cardType: "unit",
  domain: "chaos",
  energyCost: 4,
  id: createCardId("ogn-200-298"),
  isChampion: true,
  might: 4,
  name: "Twisted Fate, Gambler",
  rarity: "rare",
  rulesText:
    "When I attack, reveal the top rune of your rune deck, then recycle it. Do one of the following based on its domain:[fury] — Deal 2 to an enemy unit here and 1 to all other enemy units here.[mind] — Draw 1.[order] — Stun an enemy unit.",
  setId: "OGN",
  tags: ["Twisted Fate"],
};
