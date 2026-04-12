import type { Ability } from "@tcg/riftbound-types";
import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Magma Wurm — ogn-011-298
 *
 * Other friendly units enter ready.
 *
 * Modelled as a static ability that grants the "enters-ready" effect to
 * other friendly units. The engine static layer interprets this as a
 * grant-keyword with an "EntersReady" virtual keyword on matching units.
 */
const abilities: Ability[] = [
  {
    effect: {
      keyword: "EntersReady",
      target: {
        controller: "friendly",
        excludeSelf: true,
        type: "unit",
      },
      type: "grant-keyword",
    },
    type: "static",
  },
];

export const magmaWurm: UnitCard = {
  abilities,
  cardNumber: 11,
  cardType: "unit",
  domain: "fury",
  energyCost: 8,
  id: createCardId("ogn-011-298"),
  might: 8,
  name: "Magma Wurm",
  rarity: "common",
  rulesText: "Other friendly units enter ready.",
  setId: "OGN",
};
