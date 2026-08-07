import type { Ability } from "@tcg/riftbound-types";
import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Tricksy Tentacles — unl-054-219 (Action spell)
 *
 * Move any number of enemy units with the same controller and a total
 * Might of 8 or less to a single location.
 *
 * Modeled as a move effect over any number of enemy units:
 * `totalMight` caps the SUMMED Might of the chosen set (rule 355.11.b),
 * `sameController` forbids mixing two opponents' units, and the
 * `single-location` destination sends the whole group to ONE location
 * (rule 198.1 — battlefields AND bases).
 *
 * No printed location restriction: a unit in an opponent's base is as legal
 * a choice as one at a battlefield.
 */
const abilities: Ability[] = [
  {
    effect: {
      target: {
        controller: "enemy",
        // A single unit over 8 Might can never fit under the total cap.
        filter: [{ might: { lte: 8 } }],
        quantity: "any",
        sameController: true,
        totalMight: { lte: 8 },
        type: "unit",
      },
      to: "single-location",
      type: "move",
    },
    timing: "action",
    type: "spell",
  },
];

export const tricksyTentacles: SpellCard = {
  abilities,
  cardNumber: 54,
  cardType: "spell",
  domain: "calm",
  energyCost: 4,
  id: createCardId("unl-054-219"),
  name: "Tricksy Tentacles",
  rarity: "rare",
  rulesText:
    "Move any number of enemy units with the same controller and a total Might of 8 or less to a single location.",
  setId: "UNL",
  timing: "action",
};
