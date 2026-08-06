import type { Ability } from "@tcg/riftbound-types";
import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * King's Edict — ogn-237-298 (Action spell)
 *
 * Starting with the next player, each other player chooses a unit you
 * don't control that hasn't been chosen for this spell. Kill those units.
 *
 * rule 355.16 — the caster chooses nothing: each OTHER player, in turn order
 * starting with the next one, picks a unit the caster doesn't control that no
 * other player has already picked for this spell, and all picks are killed.
 */
const abilities: Ability[] = [
  {
    effect: {
      chooser: "each-other-player",
      // The pool the OTHER players pick from, read relative to the caster. It
      // is deliberately not `target`: nothing here is chosen when the spell is
      // played, so no play-time target is offered.
      chooserTarget: { controller: "enemy", quantity: 1, type: "unit" },
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
