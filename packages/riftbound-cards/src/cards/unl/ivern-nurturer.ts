import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const ivernNurturer: UnitCard = {
  cardNumber: 51,
  cardType: "unit",
  domain: "calm",
  energyCost: 5,
  id: createCardId("unl-051-219"),
  isChampion: true,
  might: 4,
  name: "Ivern, Nurturer",
  rarity: "rare",
  rulesText:
    "When you play me or when I hold, look at the top 3 cards of your Main Deck. You may reveal a unit from among them and draw it. Recycle the rest. Then if you revealed a Bird, Cat, Dog, or Poro, do this: [Buff] a friendly unit. (Give it a +1 [Might] buff if it doesn't have one.)",
  setId: "UNL",
  tags: ["Ivern"],
};
