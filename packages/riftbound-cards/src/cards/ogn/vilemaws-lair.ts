import type { Ability } from "@tcg/riftbound-types";
import type { BattlefieldCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Vilemaw's Lair — ogn-295-298 (Battlefield)
 *
 * Units can't move from here to base.
 *
 * Modeled as a static ability that grants a custom `NoMoveToBase` keyword
 * to every unit at this battlefield. The engine reads this keyword on
 * move validation to block base-retreat moves from this location.
 */
const abilities: Ability[] = [
  {
    effect: {
      duration: "permanent",
      keyword: "NoMoveToBase",
      target: { location: "here", type: "unit" },
      type: "grant-keyword",
    },
    type: "static",
  },
];

export const vilemawsLair: BattlefieldCard = {
  abilities,
  cardNumber: 295,
  cardType: "battlefield",
  id: createCardId("ogn-295-298"),
  name: "Vilemaw's Lair",
  rarity: "uncommon",
  rulesText: "Units can't move from here to base.",
  setId: "OGN",
};
