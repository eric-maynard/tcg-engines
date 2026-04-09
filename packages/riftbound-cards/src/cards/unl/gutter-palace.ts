import type { GearCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const gutterPalace: GearCard = {
  cardNumber: 88,
  cardType: "gear",
  domain: "mind",
  energyCost: 4,
  id: createCardId("unl-088-219"),
  name: "Gutter Palace",
  rarity: "epic",
  rulesText:
    "At the start of your Beginning Phase, if you have exactly 4 cards in hand and exactly 4 units at battlefields, you win the game.\nDiscard 1, [Exhaust]: Play a 1 [Might] Bird unit token with [Deflect]. (Opponents must pay [rainbow] to choose it with a spell or ability.)",
  setId: "UNL",
};
