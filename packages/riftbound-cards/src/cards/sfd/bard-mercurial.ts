import type { Ability } from "@tcg/riftbound-types";
import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * rule 356.2.b / 414.4 — "you may exhaust your legend as an additional cost":
 * a non-standard optional cost payable only while the legend is ready. The
 * parser reads the line as a stray "exhaust a unit" spell effect, and the
 * trigger's "open battlefield" destination as "base", so both clauses are
 * written out explicitly here.
 */
const abilities: Ability[] = [
  {
    effect: {
      additionalCost: { exhaust: { controller: "friendly", type: "legend" } },
      optional: true,
      type: "additional-cost-option",
    },
    type: "static",
  },
  {
    condition: { type: "paid-additional-cost" },
    // rule 170.11.c: an "open" battlefield is unoccupied AND uncontrolled.
    effect: {
      target: { controller: "friendly", quantity: "any", type: "unit" },
      to: "open-battlefield",
      type: "move",
    },
    trigger: { event: "play-self", on: "self" },
    type: "triggered",
  },
] as unknown as Ability[];

export const bardMercurial: UnitCard = {
  abilities,
  cardNumber: 79,
  cardType: "unit",
  domain: "mind",
  energyCost: 4,
  id: createCardId("sfd-079-221"),
  isChampion: true,
  might: 4,
  name: "Bard, Mercurial",
  rarity: "rare",
  rulesText:
    "You may exhaust your legend as an additional cost to play me.\nWhen you play me, if you paid the additional cost, move any number of your units to an open battlefield.",
  setId: "SFD",
  tags: ["Bard"],
};
