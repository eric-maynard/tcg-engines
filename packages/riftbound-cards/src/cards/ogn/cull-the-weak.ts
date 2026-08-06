import type { Ability } from "@tcg/riftbound-types";
import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Cull the Weak — ogn-209-298
 *
 * "Each player kills one of their units." Every player picks among the units
 * THEY control (rule 422.1.a); a player with none does nothing, so the caster
 * may choose zero at play time and still cast the spell.
 */
const abilities: Ability[] = [
  {
    effect: {
      player: "each",
      target: { controller: "friendly", quantity: { upTo: 1 }, type: "unit" },
      type: "kill",
    },
    timing: "action",
    type: "spell",
  },
];

export const cullTheWeak: SpellCard = {
  abilities,
  cardNumber: 209,
  cardType: "spell",
  domain: "order",
  energyCost: 2,
  id: createCardId("ogn-209-298"),
  name: "Cull the Weak",
  rarity: "common",
  rulesText: "Each player kills one of their units.",
  setId: "OGN",
  timing: "action",
};
