import type { Ability } from "@tcg/riftbound-types";
import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Ruin Runner — sfd-105-221
 *
 * I can't be chosen by enemy spells and abilities.
 *
 * Captured as a virtual "Untargetable" keyword on self. Engine support
 * for this is partial; the ability shape is correct.
 */
const abilities: Ability[] = [
  {
    effect: {
      keyword: "Untargetable",
      target: "self",
      type: "grant-keyword",
    },
    type: "static",
  },
];

export const ruinRunner: UnitCard = {
  abilities,
  cardNumber: 105,
  cardType: "unit",
  domain: "body",
  energyCost: 6,
  id: createCardId("sfd-105-221"),
  might: 5,
  name: "Ruin Runner",
  rarity: "uncommon",
  rulesText: "I can't be chosen by enemy spells and abilities.",
  setId: "SFD",
};
