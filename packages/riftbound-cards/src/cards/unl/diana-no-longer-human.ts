import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const dianaNoLongerHuman: UnitCard = {
  cardNumber: 149,
  cardType: "unit",
  domain: "chaos",
  energyCost: 4,
  id: createCardId("unl-149-219"),
  isChampion: true,
  might: 3,
  name: "Diana, No Longer Human",
  rarity: "epic",
  rulesText:
    "[Ambush] (You may play me as a [Reaction] to a battlefield where you have units.)\nWhen you play a spell, give me +2 [Might] this turn.",
  setId: "UNL",
  tags: ["Diana"],
};
