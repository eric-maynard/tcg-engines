import type { Ability } from "@tcg/riftbound-types";
import type { Effect } from "@tcg/riftbound-types/abilities/effect-types";
import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Raging Firebrand — ogn-031-298
 *
 * When you play me, the next spell you play this turn costs [5] less.
 *
 * rule 356.4.b: installs a single-fire `play-cost` discount scoped to the
 * controller's next spell this turn (consumed by the engine's pay path).
 */
const abilities: Ability[] = [
  {
    effect: {
      duration: "next",
      reduction: 5,
      replaces: "play-cost",
      // rule 355.5 / 391 — the descriptor SCOPES the delayed passive to a class
      // of cards played LATER ("the next spell you play"); it names no Game
      // Object anyone chooses while the trigger is finalized. `quantity: "all"`
      // says exactly that, keeping the item out of the caster-target prompt.
      target: { controller: "friendly", quantity: "all", type: "spell" },
      type: "replacement",
    } as unknown as Effect,
    trigger: { event: "play-self" },
    type: "triggered",
  },
];

export const ragingFirebrand: UnitCard = {
  abilities,
  cardNumber: 31,
  cardType: "unit",
  domain: "fury",
  energyCost: 6,
  id: createCardId("ogn-031-298"),
  might: 4,
  name: "Raging Firebrand",
  rarity: "rare",
  rulesText: "When you play me, the next spell you play this turn costs [5] less.",
  setId: "OGN",
};
