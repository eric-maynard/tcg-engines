import type { Ability } from "@tcg/riftbound-types";
import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * The Deathknell's play is unique to this card: it plays a unit out of HAND to
 * the controller's base, waiving only the Energy cost (rule 356.1.b — Power
 * pips are still paid). The parser has no pattern for that destination/cost
 * pair, so the abilities are spelled out here.
 */
const playFromHand = {
  from: "hand",
  ignoreCost: "energy",
  target: { type: "unit" },
  toLocation: "base",
  type: "play",
} as const;

const abilities: Ability[] = [
  {
    // rule 383.3.a.3: "you MAY reveal a UNIT from among them and draw it" — the
    // pick is unit-only and declinable; the rest are recycled either way.
    effect: {
      amount: 3,
      filter: { cardTypes: ["unit"] },
      from: "deck",
      optional: true,
      type: "look",
    },
    trigger: { event: "move-to-battlefield", on: "self" },
    type: "triggered",
  },
  {
    effect: playFromHand,
    keyword: "Deathknell",
    type: "keyword",
  },
  {
    effect: playFromHand,
    trigger: { event: "die", on: "self" },
    type: "triggered",
  },
] as unknown as Ability[];

export const riftHerald: UnitCard = {
  abilities,
  cardNumber: 179,
  cardType: "unit",
  domain: "order",
  energyCost: 8,
  id: createCardId("unl-179-219"),
  might: 7,
  name: "Rift Herald",
  rarity: "epic",
  rulesText:
    "When I move to a battlefield, look at the top 3 cards of your Main Deck. You may reveal a unit from among them and draw it. Recycle the rest.\n[Deathknell][>] Play a unit from your hand to your base, ignoring its Energy cost. (When I die, get the effect. You must still pay its Power cost.)",
  setId: "UNL",
};
