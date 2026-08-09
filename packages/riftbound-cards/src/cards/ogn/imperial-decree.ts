import type { Ability } from "@tcg/riftbound-types";
import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Imperial Decree — ogn-221-298
 *
 * "[Action] When any unit takes damage this turn, kill it."
 *
 * rule 383 / 390.2 — this is a delayed TRIGGERED ability hanging on the
 * controller for the rest of the turn, not a damage replacement: the damage is
 * still dealt and marked, and the kill is a SEPARATE later event that uses the
 * chain. That distinction is what ruling 0261e6f2eb9b9197 turns on — a unit
 * whose lethal-damage death is replaced (Zhonya's Hourglass) is then killed
 * AGAIN by the Decree trigger, because the single-use replacement was already
 * spent on the first death.
 */
const abilities: Ability[] = [
  {
    effect: {
      duration: "turn",
      effect: { target: { type: "trigger-source" }, type: "kill" },
      target: "controller",
      trigger: { event: "take-damage", on: "any-unit" },
      type: "delayed-trigger",
    },
    timing: "action",
    type: "spell",
  },
] as unknown as Ability[];

export const imperialDecree: SpellCard = {
  abilities,
  cardNumber: 221,
  cardType: "spell",
  domain: "order",
  energyCost: 5,
  id: createCardId("ogn-221-298"),
  name: "Imperial Decree",
  rarity: "uncommon",
  rulesText:
    "[Action] (Play on your turn or in showdowns.)\nWhen any unit takes damage this turn, kill it.",
  setId: "OGN",
  timing: "action",
};
