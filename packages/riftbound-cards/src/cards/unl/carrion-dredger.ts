import type { Ability } from "@tcg/riftbound-types";
import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Carrion Dredger — unl-153-219
 *
 * [Deathknell][>] Play a 1 [Might] Bird unit token with [Deflect] to
 * your base.
 */
const abilities: Ability[] = [
  {
    effect: {
      location: "base",
      token: {
        keywords: ["Deflect"],
        might: 1,
        name: "Bird",
        type: "unit",
      },
      type: "create-token",
    },
    keyword: "Deathknell",
    type: "keyword",
  },
];

export const carrionDredger: UnitCard = {
  abilities,
  cardNumber: 153,
  cardType: "unit",
  domain: "order",
  energyCost: 2,
  id: createCardId("unl-153-219"),
  might: 1,
  name: "Carrion Dredger",
  rarity: "common",
  rulesText:
    "[Deathknell][&gt;] Play a 1 [Might] Bird unit token with [Deflect] to your base. (When I die, get the effect. Opponents must pay [rainbow] to choose a [Deflect] unit with a spell or ability.)",
  setId: "UNL",
};
