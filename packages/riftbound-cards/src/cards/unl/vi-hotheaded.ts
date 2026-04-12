import type { Ability } from "@tcg/riftbound-types";
import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Vi, Hotheaded — unl-030-219
 *
 * [Deflect]
 * [2][fury]: Double my Might this turn.
 */
const abilities: Ability[] = [
  { keyword: "Deflect", type: "keyword", value: 1 },
  {
    cost: { energy: 2, power: ["fury"] },
    effect: {
      duration: "turn",
      target: "self",
      type: "double-might",
    },
    type: "activated",
  },
];

export const viHotheaded: UnitCard = {
  abilities,
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
