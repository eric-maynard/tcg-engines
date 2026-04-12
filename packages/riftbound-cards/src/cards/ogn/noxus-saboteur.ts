import type { Ability } from "@tcg/riftbound-types";
import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Noxus Saboteur — ogn-018-298
 *
 * Your opponents' [Hidden] cards can't be revealed here.
 *
 * Captured as a static grant-keyword "PreventReveal" self effect. The
 * engine's reveal-action gate honors this once implemented.
 */
const abilities: Ability[] = [
  {
    effect: {
      keyword: "PreventReveal",
      target: "self",
      type: "grant-keyword",
    },
    type: "static",
  },
];

export const noxusSaboteur: UnitCard = {
  abilities,
  cardNumber: 18,
  cardType: "unit",
  domain: "fury",
  energyCost: 3,
  id: createCardId("ogn-018-298"),
  might: 3,
  name: "Noxus Saboteur",
  rarity: "uncommon",
  rulesText: "Your opponents' [Hidden] cards can't be revealed here.",
  setId: "OGN",
};
