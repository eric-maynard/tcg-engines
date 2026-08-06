import type { Ability } from "@tcg/riftbound-types";
import type { Location } from "@tcg/riftbound-types";
import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Tibbers — ogs-018-024
 *
 * "When you play me, deal 3 to all units at battlefields."
 *
 * rule 355.5.a: "all units at battlefieldS" (plural) is a programmatic
 * selection covering EVERY battlefield — friendly and enemy units alike, no
 * choice is made. The parser collapses it to `location: "battlefield"`, which
 * the engine reads as the singular "at A battlefield" shape (ogs-002-024) and
 * turns into a caster-chosen single battlefield. `"battlefields"` keeps the
 * resolver's battlefield-zone filter (it matches any `battlefield*` zone, so
 * units in a base are excluded) without the one-battlefield choice.
 */
const abilities: Ability[] = [
  {
    effect: {
      amount: 3,
      target: { location: "battlefields" as Location, quantity: "all", type: "unit" },
      type: "damage",
    },
    trigger: { event: "play-self" },
    type: "triggered",
  },
];

export const tibbers: UnitCard = {
  abilities,
  cardNumber: 18,
  cardType: "unit",
  domain: ["fury", "chaos"],
  energyCost: 8,
  id: createCardId("ogs-018-024"),
  might: 7,
  name: "Tibbers",
  rarity: "epic",
  rulesText: "When you play me, deal 3 to all units at battlefields.",
  setId: "OGS",
};
