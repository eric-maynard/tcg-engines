import type { Ability } from "@tcg/riftbound-types";
import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Perched Grimwyrm — sfd-015-221
 *
 * Play me only to a battlefield you conquered this turn.
 *
 * Captured as a static self-keyword `PlayOnlyToConqueredBattlefield`
 * that the engine's play-restriction check can honor. Engine wiring is
 * still pending.
 */
const abilities: Ability[] = [
  {
    effect: {
      keyword: "PlayOnlyToConqueredBattlefield",
      target: "self",
      type: "grant-keyword",
    },
    type: "static",
  },
];

export const perchedGrimwyrm: UnitCard = {
  abilities,
  cardNumber: 15,
  cardType: "unit",
  domain: "fury",
  energyCost: 4,
  id: createCardId("sfd-015-221"),
  might: 5,
  name: "Perched Grimwyrm",
  rarity: "uncommon",
  rulesText:
    "Play me only to a battlefield you conquered this turn. (You can't play me anywhere else.)",
  setId: "SFD",
};
