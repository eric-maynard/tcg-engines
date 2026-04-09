import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const evelynnEntrancing: UnitCard = {
  cardNumber: 141,
  cardType: "unit",
  domain: "chaos",
  energyCost: 2,
  id: createCardId("unl-141-219"),
  isChampion: true,
  might: 2,
  name: "Evelynn, Entrancing",
  rarity: "rare",
  rulesText:
    "[Hidden] (Hide now for [rainbow] to react with later for [energy_0].)\n[Backline] (I must be assigned combat damage last.)\nWhen you play me from face down on your turn, you may move an enemy unit at a different location to my battlefield.",
  setId: "UNL",
  tags: ["Evelynn"],
};
