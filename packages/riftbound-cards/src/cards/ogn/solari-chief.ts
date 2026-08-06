import type { Ability } from "@tcg/riftbound-types";
import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Solari Chief — ogn-225-298
 *
 * When you play me, choose an enemy unit. If it is stunned, kill it.
 * Otherwise, stun it.
 *
 * Modeled as a play-self trigger whose effect is a choice between:
 *  - kill the chosen unit (when it's already stunned)
 *  - stun the chosen unit (otherwise)
 *
 * rule 355.5: the controller chooses the enemy unit first (any location,
 * stunned or not) — the conditional carries the caster-chosen `target` so
 * chain resolution raises the pick — and only then does rule 423 decide the
 * branch from THAT unit's stun status (`target-stunned`). `then`/`else` carry
 * no target of their own so they act on the bound choice.
 */
const abilities: Ability[] = [
  {
    effect: {
      condition: { type: "target-stunned" },
      else: { type: "stun" },
      target: { controller: "enemy", type: "unit" },
      then: { type: "kill" },
      type: "conditional",
    },
    trigger: { event: "play-self" },
    type: "triggered",
  },
];

export const solariChief: UnitCard = {
  abilities,
  cardNumber: 225,
  cardType: "unit",
  domain: "order",
  energyCost: 5,
  id: createCardId("ogn-225-298"),
  might: 4,
  name: "Solari Chief",
  rarity: "uncommon",
  rulesText:
    "When you play me, choose an enemy unit. If it is stunned, kill it. Otherwise, stun it. (It doesn't deal combat damage this turn.)",
  setId: "OGN",
};
