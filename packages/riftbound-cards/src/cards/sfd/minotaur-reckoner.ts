import type { Ability } from "@tcg/riftbound-types";
import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Minotaur Reckoner — sfd-014-221
 *
 * Units can't move to base.
 *
 * Modeled as a static aura that grants a custom `NoMoveToBase` keyword to
 * every unit on the board while this unit is in play. The engine reads
 * the keyword on move validation to block base-retreat moves.
 *
 * FIXME: The rules text doesn't scope "units" so this applies globally.
 */
const abilities: Ability[] = [
  {
    effect: {
      duration: "permanent",
      keyword: "NoMoveToBase",
      target: { controller: "any", type: "unit" },
      type: "grant-keyword",
    },
    type: "static",
  },
];

export const minotaurReckoner: UnitCard = {
  abilities,
  cardNumber: 14,
  cardType: "unit",
  domain: "fury",
  energyCost: 5,
  id: createCardId("sfd-014-221"),
  might: 5,
  name: "Minotaur Reckoner",
  rarity: "uncommon",
  rulesText: "Units can't move to base.",
  setId: "SFD",
};
