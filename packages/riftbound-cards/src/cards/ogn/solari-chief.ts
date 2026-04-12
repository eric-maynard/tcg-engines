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
 * The engine's conditional effect executes the `then`/`else` branch based
 * on whether the chosen target has the stunned filter. Since conditions
 * don't yet support "target has filter", we use the closest approximation:
 * a conditional with a count-based comparison that matches any stunned
 * enemy unit at the chosen location.
 */
const abilities: Ability[] = [
  {
    effect: {
      condition: {
        comparison: { gte: 1 },
        target: {
          controller: "enemy",
          filter: "stunned",
          type: "unit",
        },
        type: "count",
      },
      else: {
        target: { controller: "enemy", type: "unit" },
        type: "stun",
      },
      then: {
        target: { controller: "enemy", filter: "stunned", type: "unit" },
        type: "kill",
      },
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
