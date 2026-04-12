import type { Ability } from "@tcg/riftbound-types";
import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Apprentice Smith — sfd-041-221
 *
 * "When I move, reveal the top card of your Main Deck. If it's a gear, draw
 *  it. Otherwise, recycle it."
 *
 * Modeled as a triggered reveal with a `then` look-like branch — we use a
 * sequence that reveals and then recycles 1 (approximation; the branch for
 * drawing vs. recycling is not structurally represented).
 */
const abilities: Ability[] = [
  {
    effect: {
      amount: 1,
      from: "deck",
      then: { amount: 1, from: "board", type: "recycle" },
      type: "reveal",
      until: "gear",
    },
    trigger: { event: "move", on: "self" },
    type: "triggered",
  },
];

export const apprenticeSmith: UnitCard = {
  abilities,
  cardNumber: 41,
  cardType: "unit",
  domain: "calm",
  energyCost: 2,
  id: createCardId("sfd-041-221"),
  might: 2,
  name: "Apprentice Smith",
  rarity: "uncommon",
  rulesText:
    "When I move, reveal the top card of your Main Deck. If it's a gear, draw it. Otherwise, recycle it.",
  setId: "SFD",
};
