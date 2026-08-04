import type { Ability } from "@tcg/riftbound-types";
import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

// Rule 808.1: Deathknell is a triggered-ability keyword; the engine reads
// `abilities`, not rulesText, so the trigger must be declared here.
const abilities: Ability[] = [
  {
    effect: { amount: 1, type: "draw" },
    keyword: "Deathknell",
    type: "keyword",
  },
];

export const watchfulSentry: UnitCard = {
  abilities,
  cardNumber: 96,
  cardType: "unit",
  domain: "mind",
  energyCost: 2,
  id: createCardId("ogn-096-298"),
  might: 1,
  name: "Watchful Sentry",
  rarity: "common",
  rulesText: "[Deathknell] — Draw 1. (When I die, get the effect.)",
  setId: "OGN",
};
