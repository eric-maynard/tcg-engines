import type { Ability } from "@tcg/riftbound-types";
import type { GearCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Temporal Portal — sfd-078-221 (Gear)
 *
 * [rainbow], [Exhaust]: Give the next spell you play this turn [Repeat]
 * equal to its cost.
 */
const abilities: Ability[] = [
  {
    cost: { exhaust: true, power: ["rainbow"] },
    effect: {
      duration: "turn",
      keyword: "NextSpellRepeat",
      target: "controller",
      type: "grant-keyword",
    },
    type: "activated",
  },
];

export const temporalPortal: GearCard = {
  abilities,
  cardNumber: 78,
  cardType: "gear",
  domain: "mind",
  energyCost: 3,
  id: createCardId("sfd-078-221"),
  name: "Temporal Portal",
  rarity: "uncommon",
  rulesText:
    "[rainbow], [Exhaust]: Give the next spell you play this turn [Repeat] equal to its cost. (You may pay the additional cost to repeat the spell's effect.)",
  setId: "SFD",
};
