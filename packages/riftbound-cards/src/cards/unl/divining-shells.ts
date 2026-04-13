import type { Ability } from "@tcg/riftbound-types";
import type { GearCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Divining Shells — unl-161-219 (Gear)
 *
 * "[Vision] (When you play this, look at the top card of your Main Deck.
 *  You may recycle it.)
 *  [Action][>] Kill this, [Exhaust]: Give a unit +2 [Might] this turn."
 *
 * Two abilities:
 *  1. Vision keyword-effect — look at top card of main deck, may recycle.
 *  2. Action-timing activated ability whose cost is `kill: "self"` +
 *     `exhaust: true` and whose effect grants +2 Might to a chosen unit
 *     until end of turn.
 */
const abilities: Ability[] = [
  {
    effect: {
      amount: 1,
      from: "deck",
      then: { recycle: 1 },
      type: "look",
    },
    keyword: "Vision",
    type: "keyword",
  },
  {
    cost: { exhaust: true, kill: "self" },
    effect: {
      amount: 2,
      duration: "turn",
      target: { type: "unit" },
      type: "modify-might",
    },
    timing: "action",
    type: "activated",
  },
];

export const diviningShells: GearCard = {
  abilities,
  cardNumber: 161,
  cardType: "gear",
  domain: "order",
  energyCost: 2,
  id: createCardId("unl-161-219"),
  name: "Divining Shells",
  rarity: "uncommon",
  rulesText:
    "[Vision] (When you play this, look at the top card of your Main Deck. You may recycle it.)\n[Action][&gt;] Kill this, [Exhaust]: Give a unit +2 [Might] this turn.",
  setId: "UNL",
};
