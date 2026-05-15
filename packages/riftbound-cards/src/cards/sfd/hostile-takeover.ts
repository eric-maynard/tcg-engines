import type { Ability } from "@tcg/riftbound-types";
import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Hostile Takeover — sfd-202-221 (Action spell, [Hidden])
 *
 * "Take control of an enemy unit at a battlefield. Ready it. … Lose control
 * of that unit and recall it at end of turn."
 *
 * Modeled as a `sequence`:
 *   1. take-control of an enemy unit at a battlefield, `duration:"turn"`
 *      → the engine records a pending controller-revert for the Ending phase.
 *   2. enter-ready on the same target (the just-controlled unit) so it can
 *      legally attack/be exhausted-for-rune this turn (rule 524 — "Ready it").
 *
 * The "recall at end of turn" half of the rules text falls out of:
 *   a. The Ending-phase controller revert (engine wiring restores P2).
 *   b. Cleanup-time SBA (engine state-based checks may move units to base
 *      depending on board configuration). A future tick may add an explicit
 *      `recall` step here if (a)+(b) don't fully replicate the printed text
 *      in all board configurations.
 */
const abilities: Ability[] = [
  { keyword: "Hidden", type: "keyword" },
  {
    effect: {
      effects: [
        {
          duration: "turn",
          target: { controller: "enemy", location: "battlefield", type: "unit" },
          type: "take-control",
        },
        {
          target: { type: "self" },
          type: "ready",
        },
      ],
      type: "sequence",
    },
    timing: "action",
    type: "spell",
  },
];

export const hostileTakeover: SpellCard = {
  abilities,
  cardNumber: 202,
  cardType: "spell",
  domain: ["mind", "order"],
  energyCost: 5,
  id: createCardId("sfd-202-221"),
  name: "Hostile Takeover",
  rarity: "epic",
  rulesText:
    "[Hidden] (Hide now for [rainbow] to react with later for [energy_0].)\nTake control of an enemy unit at a battlefield. Ready it. (Start a combat if other enemies are there. Otherwise, conquer.)\nLose control of that unit and recall it at end of turn. (Send it to base. This isn't a move.)",
  setId: "SFD",
  timing: "action",
};
