import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const pykeReturned: UnitCard = {
  cardNumber: 145,
  cardType: "unit",
  domain: "chaos",
  energyCost: 3,
  id: createCardId("unl-145-219"),
  isChampion: true,
  might: 3,
  name: "Pyke, Returned",
  rarity: "rare",
  rulesText:
    "[Hidden] (Hide now for [rainbow] to react with later for [energy_0].)\n[Backline] (I must be assigned combat damage last.)\nOnce each turn, when an enemy unit dies while I'm at a battlefield, play a Gold gear token exhausted. (It has &quot;[Reaction][&gt;] Kill this, [Exhaust]: [Add] [rainbow].&quot;)",
  setId: "UNL",
  tags: ["Pyke"],
};
