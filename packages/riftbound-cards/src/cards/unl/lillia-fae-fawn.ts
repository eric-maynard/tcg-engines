import type { Ability } from "@tcg/riftbound-types";
import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Lillia, Fae Fawn — unl-082-219
 *
 * [Accelerate] (You may pay [1][mind] as an additional cost to have me
 *   enter ready.)
 * When I move from a location, play a 3 [Might] Sprite unit token with
 *   [Temporary] there.
 *
 * Two abilities:
 *  1. Accelerate keyword with its payment cost
 *  2. Triggered on self move-from-battlefield: spawn a Temporary Sprite
 *     token at the origin location
 */
const abilities: Ability[] = [
  {
    cost: { energy: 1, power: ["mind"] },
    keyword: "Accelerate",
    type: "keyword",
  },
  {
    effect: {
      location: "here",
      token: {
        keywords: ["Temporary"],
        might: 3,
        name: "Sprite",
        type: "unit",
      },
      type: "create-token",
    },
    trigger: { event: "move-from-battlefield", on: "self" },
    type: "triggered",
  },
];

export const lilliaFaeFawn: UnitCard = {
  abilities,
  cardNumber: 82,
  cardType: "unit",
  domain: "mind",
  energyCost: 3,
  id: createCardId("unl-082-219"),
  isChampion: true,
  might: 3,
  name: "Lillia, Fae Fawn",
  rarity: "rare",
  rulesText:
    "[Accelerate] (You may pay [1][mind] as an additional cost to have me enter ready.)\nWhen I move from a location, play a 3 [Might] Sprite unit token with [Temporary] there. (Kill it at the start of its controller's Beginning Phase, before scoring.)",
  setId: "UNL",
  tags: ["Lillia"],
};
