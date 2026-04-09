import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const watchfulSentry: UnitCard = {
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
