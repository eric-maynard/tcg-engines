import type { LegendCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const handOfNoxus: LegendCard = {
  cardNumber: 253,
  cardType: "legend",
  championTag: "Darius",
  domain: ["fury", "order"],
  id: createCardId("ogn-253-298"),
  name: "Hand of Noxus",
  rarity: "rare",
  rulesText:
    "[Exhaust]: [Reaction], [Legion] — [Add] [1]. (Abilities that add resources can't be reacted to. Get the effect if you've played a card this turn.)",
  setId: "OGN",
};
