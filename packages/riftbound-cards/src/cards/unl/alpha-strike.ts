import type { Ability } from "@tcg/riftbound-types";
import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Alpha Strike — unl-192-219 (Action spell)
 *
 * "[Action] Choose a friendly unit. It deals damage equal to its Might
 *  split among enemy units at battlefields. Then for each unit this kills,
 *  do this: Gain 1 XP."
 *
 * Modeled as a sequence:
 *  1. `damage` effect — amount equal to the chosen friendly unit's Might,
 *     dealt split (`split: true`) across enemy units at battlefields.
 *     The engine lets the active player distribute the damage amongst
 *     legal targets.
 *  2. `for-each` over enemy units killed this turn at battlefields,
 *     granting 1 XP per killed unit.
 *
 * FIXME: there is no first-class "units this damage killed" target; the
 * `for-each { filter: "damaged" }` scope is the closest approximation and
 * over-counts units that were already damaged. A true implementation
 * would require a per-effect kill counter threaded through `EffectContext`.
 */
const abilities: Ability[] = [
  {
    effect: {
      effects: [
        {
          amount: {
            might: { controller: "friendly", type: "unit" },
          },
          split: true,
          target: {
            controller: "enemy",
            location: "battlefield",
            quantity: "all",
            type: "unit",
          },
          type: "damage",
        },
        {
          effect: { amount: 1, type: "gain-xp" },
          target: {
            controller: "enemy",
            filter: "damaged",
            location: "battlefield",
            type: "unit",
          },
          type: "for-each",
        },
      ],
      type: "sequence",
    },
    timing: "action",
    type: "spell",
  },
];

export const alphaStrike: SpellCard = {
  abilities,
  cardNumber: 192,
  cardType: "spell",
  domain: ["calm", "body"],
  energyCost: 3,
  id: createCardId("unl-192-219"),
  name: "Alpha Strike",
  rarity: "epic",
  rulesText:
    "[Action] (Play on your turn or in showdowns.)\nChoose a friendly unit. It deals damage equal to its Might split among enemy units at battlefields. Then for each unit this kills, do this: Gain 1 XP.",
  setId: "UNL",
  timing: "action",
};
