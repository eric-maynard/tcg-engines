import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const allayEagerAdmirer: UnitCard = {
  cardNumber: 41,
  cardType: "unit",
  domain: "calm",
  energyCost: 3,
  id: createCardId("unl-041-219"),
  isChampion: true,
  might: 3,
  name: "Allay, Eager Admirer",
  rarity: "uncommon",
  rulesText:
    "[Deflect] (Opponents must pay [rainbow] to choose me with a spell or ability.)\nWhile I'm at a battlefield, your other units here have [Deflect].",
  setId: "UNL",
  tags: ["Allay"],
};
