import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const khazixMutatingHorror: UnitCard = {
  cardNumber: 143,
  cardType: "unit",
  domain: "chaos",
  energyCost: 4,
  id: createCardId("unl-143-219"),
  isChampion: true,
  might: 4,
  name: "Kha'Zix, Mutating Horror",
  rarity: "rare",
  rulesText:
    "[Ambush] (You may play me as a [Reaction] to a battlefield where you have units.)\nWhen I attack or defend, if an enemy unit is alone here, give me +2 [Might] this turn and gain 2 XP.",
  setId: "UNL",
  tags: ["Kha'Zix"],
};
