import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const poppyParagon: UnitCard = {
  cardNumber: 116,
  cardType: "unit",
  domain: "body",
  energyCost: 5,
  id: createCardId("unl-116-219"),
  isChampion: true,
  might: 5,
  name: "Poppy, Paragon",
  rarity: "rare",
  rulesText:
    "[Deflect] (Opponents must pay [rainbow] to choose me with a spell or ability.)\nWhen you play me, if an opponent's score is within 3 points of the Victory Score, ready me and gain 3 XP.",
  setId: "UNL",
  tags: ["Poppy"],
};
