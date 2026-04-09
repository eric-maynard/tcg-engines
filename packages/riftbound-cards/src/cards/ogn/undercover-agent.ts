import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const undercoverAgent: UnitCard = {
  cardNumber: 178,
  cardType: "unit",
  domain: "chaos",
  energyCost: 5,
  id: createCardId("ogn-178-298"),
  might: 5,
  name: "Undercover Agent",
  rarity: "common",
  rulesText: "[Deathknell] — Discard 2, then draw 2. (When I die, get the effect.)",
  setId: "OGN",
};
