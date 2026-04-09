import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const hweiBroodingPainter: UnitCard = {
  cardNumber: 80,
  cardType: "unit",
  domain: "mind",
  energyCost: 5,
  id: createCardId("unl-080-219"),
  isChampion: true,
  might: 5,
  name: "Hwei, Brooding Painter",
  rarity: "rare",
  rulesText:
    "When I move, draw 1, then discard 1. Then, do the following based on the discarded card's type:Spell — Draw 1.Gear — Ready up to 2 runes.Unit — Give me +3 [Might] this turn.",
  setId: "UNL",
  tags: ["Hwei"],
};
