import type { Ability } from "@tcg/riftbound-types";
import type { GearCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Shard of Undoing — unl-174-219 (Gear)
 *
 * "The first time a friendly unit dies during your Beginning Phase each
 *  turn, each opponent must kill one of their units."
 *
 * Modeled as a `die` trigger on friendly units with two restrictions:
 *  - `first-time-each-turn` (only the first matching death per turn fires)
 *  - `during-turn` / "your" (constrains to the controller's own turn)
 *
 * The "during Beginning Phase" window is narrower than "during your
 * turn"; without a phase-scoped trigger restriction we approximate with
 * "during your turn".
 *
 * FIXME: true fidelity would require a "during Beginning Phase"
 * restriction. The engine currently only exposes turn-scope restrictions.
 *
 * Effect: each opponent is forced to kill one of their own units.
 */
const abilities: Ability[] = [
  {
    effect: {
      player: "each",
      target: { controller: "enemy", type: "unit" },
      type: "kill",
    },
    trigger: {
      event: "die",
      on: "friendly-units",
      restrictions: [{ type: "first-time-each-turn" }, { type: "during-turn", whose: "your" }],
    },
    type: "triggered",
  },
];

export const shardOfUndoing: GearCard = {
  abilities,
  cardNumber: 174,
  cardType: "gear",
  domain: "order",
  energyCost: 6,
  id: createCardId("unl-174-219"),
  name: "Shard of Undoing",
  rarity: "rare",
  rulesText:
    "The first time a friendly unit dies during your Beginning Phase each turn, each opponent must kill one of their units.",
  setId: "UNL",
};
