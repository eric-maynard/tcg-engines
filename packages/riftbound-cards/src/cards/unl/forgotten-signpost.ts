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
 * - Cost: [Exhaust] this gear.
 * - Timing: action
 * - Effect: `to: "exhausted-ally"` — the engine exhausts a ready friendly unit
 *   other than the moved one (rule 355.10.c.1: chosen, not targeted) and that
 *   unit's location IS the destination (rule 449.1), so a battlefield where you
 *   exhausted nothing can never be reached and a base can.
 */
const abilities: Ability[] = [
  {
    cost: {
      exhaust: true,
    },
    effect: {
      costExhaust: {
        controller: "friendly",
        filter: "ready",
        type: "unit",
      },
      target: {
        controller: "friendly",
        excludeSelf: true,
        type: "unit",
      },
      to: "exhausted-ally",
      type: "move",
    },
    timing: "action",
    type: "activated",
  },
] as unknown as Ability[];

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
    "[Action][>] Exhaust a unit you control, [Exhaust]: Move a different unit you control to the location of the unit you exhausted to pay for this ability.",
  setId: "UNL",
};
