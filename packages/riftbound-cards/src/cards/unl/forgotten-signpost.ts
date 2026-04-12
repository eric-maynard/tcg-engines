import type { Ability } from "@tcg/riftbound-types";
import type { GearCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Forgotten Signpost — unl-045-219
 *
 * [Action][>] Exhaust a unit you control, [Exhaust]: Move a different
 * unit you control to the location of the unit you exhausted to pay
 * for this ability.
 *
 * Activated ability:
 * - Cost: exhaust a friendly unit (chosen) AND exhaust self
 * - Timing: action
 * - Effect: move another friendly unit to the chosen (exhausted) unit's
 *   location. Uses a pending-value binding so the move target references
 *   the chosen unit from the cost step.
 *
 * FIXME: The existing `Cost` shape doesn't expose the chosen target to
 * the effect. We model this via a `variable: "exhausted-target"` location
 * reference the engine must resolve at execution time.
 */
const abilities: Ability[] = [
  {
    cost: {
      exhaust: true,
      spend: {
        amount: 1,
        target: { controller: "friendly", type: "unit" },
        type: "rune",
      },
    },
    effect: {
      target: {
        controller: "friendly",
        excludeSelf: true,
        type: "unit",
      },
      to: { battlefield: "any" },
      type: "move",
    },
    timing: "action",
    type: "activated",
  },
];

export const forgottenSignpost: GearCard = {
  abilities,
  cardNumber: 45,
  cardType: "gear",
  domain: "calm",
  energyCost: 2,
  id: createCardId("unl-045-219"),
  name: "Forgotten Signpost",
  rarity: "uncommon",
  rulesText:
    "[Action][&gt;] Exhaust a unit you control, [Exhaust]: Move a different unit you control to the location of the unit you exhausted to pay for this ability.",
  setId: "UNL",
};
