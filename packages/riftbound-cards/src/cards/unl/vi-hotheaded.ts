import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const viHotheaded: UnitCard = {
  cardNumber: 30,
  cardType: "unit",
  domain: "fury",
  energyCost: 4,
  id: createCardId("unl-030-219"),
  isChampion: true,
  might: 3,
  name: "Vi, Hotheaded",
  rarity: "epic",
  rulesText:
    "[Deflect] (Opponents must pay [rainbow] to choose me with a spell or ability.)\n[2][fury]: Double my Might this turn.",
  setId: "UNL",
  tags: ["Vi"],
};
