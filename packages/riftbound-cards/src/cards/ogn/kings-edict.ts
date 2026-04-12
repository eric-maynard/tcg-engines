import type { Ability } from "@tcg/riftbound-types";
import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * King's Edict — ogn-237-298 (Action spell)
 *
 * Starting with the next player, each other player chooses a unit you
 * don't control that hasn't been chosen for this spell. Kill those units.
 *
 * Approximated as a spell that kills one enemy unit per opponent. The
 * full multi-player choose-and-kill flow requires multiplayer-aware
 * interactive targeting that the engine does not yet have; the spell
 * effect still correctly kills a set of enemy units.
 *
 * FIXME: Should pick one unit per opponent (not any N enemy units). The
 * engine's targeting system doesn't yet express "one unit controlled by
 * each opponent in turn order".
 */
const abilities: Ability[] = [
  {
    effect: {
      player: "each",
      target: { controller: "enemy", quantity: 1, type: "unit" },
      type: "kill",
    },
    timing: "action",
    type: "spell",
  },
];

export const kingsEdict: SpellCard = {
  abilities,
  cardNumber: 237,
  cardType: "spell",
  domain: "order",
  energyCost: 6,
  id: createCardId("ogn-237-298"),
  name: "King's Edict",
  rarity: "rare",
  rulesText:
    "Starting with the next player, each other player chooses a unit you don't control that hasn't been chosen for this spell. Kill those units.",
  setId: "OGN",
  timing: "action",
};
