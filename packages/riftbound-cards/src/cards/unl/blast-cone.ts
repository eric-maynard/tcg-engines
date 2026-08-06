import type { Ability } from "@tcg/riftbound-types";
import type { GearCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Blast Cone — unl-133-219
 *
 * When you play this, you may move an enemy unit.
 * When you move an enemy unit, you may exhaust this to [Stun] it.
 *
 * rule-id: unl-133-219 — Rule 355.4: "move an enemy unit" names no
 * destination, so the controller chooses one (`to: "choose"`). The second
 * ability is a `move` trigger scoped to enemy units moved BY this card's
 * controller (`actor: "controller"`); the "exhaust this" opt-in cost rides on
 * `pay-cost`, and "it" is the moved unit (`trigger-source`). The parser
 * produced no ability for the second sentence.
 */
const abilities: Ability[] = [
  {
    effect: {
      target: { controller: "enemy", type: "unit" },
      to: "choose",
      type: "move",
    },
    optional: true,
    trigger: { event: "play-self" },
    type: "triggered",
  },
  {
    condition: { cost: { exhaust: true }, type: "pay-cost" },
    effect: {
      target: { type: "trigger-source" },
      type: "stun",
    },
    optional: true,
    trigger: {
      event: "move",
      on: { actor: "controller", cardType: "unit", controller: "enemy" },
    },
    type: "triggered",
  },
];

export const blastCone: GearCard = {
  abilities,
  cardNumber: 133,
  cardType: "gear",
  domain: "chaos",
  energyCost: 4,
  id: createCardId("unl-133-219"),
  name: "Blast Cone",
  rarity: "uncommon",
  rulesText:
    "When you play this, you may move an enemy unit.\nWhen you move an enemy unit, you may exhaust this to [Stun] it. (It doesn't deal combat damage this turn.)",
  setId: "UNL",
};
