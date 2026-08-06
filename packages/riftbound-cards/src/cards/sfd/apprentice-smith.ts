import type { Ability } from "@tcg/riftbound-types";
import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Apprentice Smith — sfd-041-221
 *
 * "When I move, reveal the top card of your Main Deck. If it's a gear, draw
 *  it. Otherwise, recycle it."
 *
 * Bounded reveal of exactly the top card: a hit is drawn, a miss is recycled
 * (rule 403 — to the bottom of the Main Deck).
 */
const abilities: Ability[] = [
  {
    effect: {
      amount: 1,
      from: "deck",
      then: { draw: 1, recycle: "rest" },
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
