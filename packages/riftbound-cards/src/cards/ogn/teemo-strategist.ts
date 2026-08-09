import type { Ability } from "@tcg/riftbound-types";
import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Teemo, Strategist — ogn-121-298
 *
 * [Hidden]
 * When I defend, choose an enemy unit here and reveal the top 5 cards of your
 * Main Deck. Deal 1 to that unit for each card with [Hidden] revealed this
 * way, then recycle the revealed cards.
 *
 * rule-id: ogn-121-298 — hand-authored so the damage target is restricted to
 * an enemy unit at Teemo's battlefield ("here"); the parser dropped the
 * "choose an enemy unit here" clause and emitted a bare {type:"unit"}.
 */
const abilities: Ability[] = [
  { keyword: "Hidden", type: "keyword" },
  {
    effect: {
      amount: { revealTop: 5, then: "recycle", withKeyword: "Hidden" },
      target: { controller: "enemy", location: "here", type: "unit" },
      type: "damage",
    },
    trigger: { event: "defend", on: "self" },
    type: "triggered",
  },
];

export const teemoStrategist: UnitCard = {
  abilities,
  cardNumber: 121,
  cardType: "unit",
  domain: "mind",
  energyCost: 2,
  id: createCardId("ogn-121-298"),
  isChampion: true,
  might: 2,
  name: "Teemo, Strategist",
  rarity: "epic",
  rulesText:
    "[Hidden] (Hide now for [rainbow] to react with later for [0].)\nWhen I defend, choose an enemy unit here and reveal the top 5 cards of your Main Deck. Deal 1 to that unit for each card with [Hidden] revealed this way, then recycle the revealed cards.",
  setId: "OGN",
  tags: ["Teemo"],
};
