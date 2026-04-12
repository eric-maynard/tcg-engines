import type { Ability } from "@tcg/riftbound-types";
import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Sivir, Ambitious — sfd-120-221
 *
 * [Deflect 2]
 * When I conquer after an attack, if you assigned 5 or more excess damage
 * to enemy units, you may deal that much to an enemy unit.
 *
 * Two abilities:
 *  1. Deflect 2 keyword
 *  2. Triggered on conquer: if 5+ excess damage was assigned this turn,
 *     deal that much damage to an enemy unit. Uses a `variable`
 *     amount expression so the engine can plug in the actual excess-damage
 *     value captured during the preceding combat.
 *
 * FIXME: The engine currently has no first-class excess-damage counter;
 * the variable reference assumes a future `combat.excessDamage` slot.
 */
const abilities: Ability[] = [
  { keyword: "Deflect", type: "keyword", value: 2 },
  {
    condition: {
      comparison: { gte: 5 },
      target: {
        filter: { keyword: "excess-damage" },
        type: "unit",
      },
      type: "count",
    },
    effect: {
      amount: { variable: "excess-damage" },
      target: { controller: "enemy", type: "unit" },
      type: "damage",
    },
    optional: true,
    trigger: { event: "conquer", on: "self" },
    type: "triggered",
  },
];

export const sivirAmbitious: UnitCard = {
  abilities,
  cardNumber: 120,
  cardType: "unit",
  domain: "body",
  energyCost: 6,
  id: createCardId("sfd-120-221"),
  isChampion: true,
  might: 7,
  name: "Sivir, Ambitious",
  rarity: "epic",
  rulesText:
    "[Deflect 2] (Opponents must pay [rainbow][rainbow] to choose me with a spell or Ability.)\nWhen I conquer after an attack, if you assigned 5 or more excess damage to enemy units, you may deal that much to an enemy unit.",
  setId: "SFD",
  tags: ["Sivir"],
};
