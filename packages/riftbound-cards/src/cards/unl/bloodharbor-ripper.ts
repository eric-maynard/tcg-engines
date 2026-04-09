import type { LegendCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const bloodharborRipper: LegendCard = {
  cardNumber: 185,
  cardType: "legend",
  championTag: "Pyke",
  domain: ["fury", "chaos"],
  id: createCardId("unl-185-219"),
  name: "Bloodharbor Ripper",
  rarity: "rare",
  rulesText:
    "[1], [Exhaust]: Return a friendly unit at a battlefield to its owner's hand. Play a Gold gear token exhausted. (It has &quot;[Reaction][&gt;] Kill this, [Exhaust]: [Add] [rainbow].&quot;)",
  setId: "UNL",
};
