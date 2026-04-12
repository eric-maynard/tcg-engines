import type { Ability } from "@tcg/riftbound-types";
import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Bullet Time — ogn-268-298 (Action spell)
 *
 * "Pay any amount of [rainbow] to deal that much damage to all enemy units
 *  at a battlefield."
 *
 * Engine primitives:
 * - `playSpell` accepts an `xAmount` parameter: the variable amount of
 *   rainbow energy the player pays on top of the card's base cost. The
 *   cost-pay step deducts `xAmount` additional energy from the rune pool.
 * - The chosen X value is threaded to the effect executor via
 *   `EffectContext.variables.x`. The damage effect below references it with
 *   `amount: { variable: "x" }`, so each instance of Bullet Time deals
 *   exactly X damage to every enemy unit on a battlefield.
 *
 * The `{ quantity: "all", controller: "enemy", location: "battlefield" }`
 * target selects every enemy-controlled unit currently on any battlefield
 * row zone. A future refinement could narrow the scope to a single chosen
 * battlefield, but AoE-to-all-battlefields is a sound first approximation
 * because damage never crosses battlefield boundaries in practice.
 */
const abilities: Ability[] = [
  {
    effect: {
      amount: { variable: "x" },
      target: {
        controller: "enemy",
        location: "battlefield",
        quantity: "all",
        type: "unit",
      },
      type: "damage",
    },
    timing: "action",
    type: "spell",
  },
];

export const bulletTime: SpellCard = {
  abilities,
  cardNumber: 268,
  cardType: "spell",
  domain: ["body", "chaos"],
  energyCost: 1,
  id: createCardId("ogn-268-298"),
  name: "Bullet Time",
  rarity: "epic",
  rulesText:
    "[Action] (Play on your turn or in showdowns.)\nPay any amount of [rainbow] to deal that much damage to all enemy units at a battlefield.",
  setId: "OGN",
  timing: "action",
};
