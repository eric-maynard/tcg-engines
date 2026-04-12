import type { Ability } from "@tcg/riftbound-types";
import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Rengar, Trophy Hunter — unl-120-219
 *
 * [Ambush]
 * I can be played to a battlefield where there are enemy units (even if
 * you don't have units there).
 *
 * Represented via static grant-keyword self effects. "Ambush" and
 * "CanPlayToEnemyBattlefield" are honored by the play-restriction check
 * in move validation.
 */
const abilities: Ability[] = [
  {
    effect: {
      keyword: "Ambush",
      target: "self",
      type: "grant-keyword",
    },
    type: "static",
  },
  {
    effect: {
      keyword: "CanPlayToEnemyBattlefield",
      target: "self",
      type: "grant-keyword",
    },
    type: "static",
  },
];

export const rengarTrophyHunter: UnitCard = {
  abilities,
  cardNumber: 120,
  cardType: "unit",
  domain: "body",
  energyCost: 5,
  id: createCardId("unl-120-219"),
  isChampion: true,
  might: 6,
  name: "Rengar, Trophy Hunter",
  rarity: "epic",
  rulesText:
    "[Ambush] (You may play me as a [Reaction] to a battlefield where you have units.)\nI can be played to a battlefield where there are enemy units (even if you don't have units there).",
  setId: "UNL",
  tags: ["Rengar"],
};
