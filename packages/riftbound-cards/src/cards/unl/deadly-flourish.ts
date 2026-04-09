import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const deadlyFlourish: SpellCard = {
  cardNumber: 73,
  cardType: "spell",
  domain: "mind",
  energyCost: 4,
  id: createCardId("unl-073-219"),
  name: "Deadly Flourish",
  rarity: "uncommon",
  rulesText:
    "Deal 3 to an enemy unit. When it dies this turn, play a Gold gear token exhausted. (It has &quot;[Reaction][&gt;] Kill this, [Exhaust]: [Add] [rainbow].&quot;)",
  setId: "UNL",
  timing: "reaction",
};
