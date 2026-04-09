import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const volibearFurious: UnitCard = {
  cardNumber: 41,
  cardType: "unit",
  domain: "fury",
  energyCost: 10,
  id: createCardId("ogn-041-298"),
  isChampion: true,
  might: 9,
  name: "Volibear, Furious",
  rarity: "epic",
  rulesText:
    "[Deflect 2] (Opponents must pay [rainbow][rainbow] to choose me with a spell or ability.)\nWhen I attack, deal 5 damage split among any number of enemy units here.",
  setId: "OGN",
  tags: ["Volibear"],
};
