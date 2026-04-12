import type { Ability } from "@tcg/riftbound-types";
import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Brynhir Thundersong — ogn-026-298
 *
 * When you play me, opponents can't play cards this turn.
 *
 * Represented as a triggered ability that grants opponents the virtual
 * "CannotPlayCards" keyword for the rest of the turn. Engine-side support
 * for this restriction is still pending; the ability structure is wired
 * up so it will activate as soon as the effect is implemented.
 */
const abilities: Ability[] = [
  {
    effect: {
      duration: "turn",
      keyword: "CannotPlayCards",
      target: { type: "player", which: "opponent" },
      type: "grant-keyword",
    },
    trigger: { event: "play-self" },
    type: "triggered",
  },
];

export const brynhirThundersong: UnitCard = {
  abilities,
  cardNumber: 26,
  cardType: "unit",
  domain: "fury",
  energyCost: 6,
  id: createCardId("ogn-026-298"),
  might: 5,
  name: "Brynhir Thundersong",
  rarity: "rare",
  rulesText: "When you play me, opponents can't play cards this turn.",
  setId: "OGN",
};
