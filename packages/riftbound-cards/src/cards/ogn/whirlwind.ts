import type { Ability } from "@tcg/riftbound-types";
import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Whirlwind — ogn-187-298
 *
 * "Starting with the next player, each player may return a unit to its
 *  owner's hand."
 *
 * Nothing is chosen when the spell is played; as it resolves each player, in
 * turn order beginning with the one after the caster, may pick a unit of
 * their choice (rule 355.2). `each-player-may` runs one declinable prompt per
 * player and returns each pick to its OWNER's hand (rule 401).
 */
const abilities: Ability[] = [
  {
    effect: {
      effect: {
        target: { type: "unit" },
        type: "return-to-hand",
      },
      type: "each-player-may",
    },
    timing: "action",
    type: "spell",
  },
];

export const whirlwind: SpellCard = {
  abilities,
  cardNumber: 187,
  cardType: "spell",
  domain: "chaos",
  energyCost: 3,
  id: createCardId("ogn-187-298"),
  name: "Whirlwind",
  rarity: "uncommon",
  rulesText: "Starting with the next player, each player may return a unit to its owner's hand.",
  setId: "OGN",
  timing: "action",
};
