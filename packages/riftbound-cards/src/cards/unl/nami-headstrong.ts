import type { Ability } from "@tcg/riftbound-types";
import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Nami, Headstrong — unl-052-219
 *
 * - Optional additional cost: pay [calm].
 * - When played, if paid, stun an enemy unit.
 * - When I hold, the next unit you play this turn enters ready with a buff.
 *
 * Modeled as two triggered abilities: the stun on play (gated on paid
 * additional cost) and a hold-trigger that installs a one-shot replacement
 * to ready+buff the next played friendly unit (approximation).
 */
const abilities: Ability[] = [
  {
    condition: { type: "paid-additional-cost" },
    effect: {
      target: { controller: "enemy", type: "unit" },
      type: "stun",
    },
    trigger: { event: "play-self" },
    type: "triggered",
  },
  {
    effect: {
      effects: [
        {
          target: { controller: "friendly", type: "unit" },
          type: "ready",
        },
        {
          target: { controller: "friendly", type: "unit" },
          type: "buff",
        },
      ],
      type: "sequence",
    },
    trigger: { event: "hold", on: "self" },
    type: "triggered",
  },
];

export const namiHeadstrong: UnitCard = {
  abilities,
  cardNumber: 52,
  cardType: "unit",
  domain: "calm",
  energyCost: 3,
  id: createCardId("unl-052-219"),
  isChampion: true,
  might: 3,
  name: "Nami, Headstrong",
  rarity: "rare",
  rulesText:
    "You may pay [calm] as an additional cost to play me.\nWhen you play me, if you paid the additional cost, [Stun] an enemy unit. (It doesn't deal combat damage this turn.)\nWhen I hold, the next time you play a unit this turn, ready it and [Buff] it.",
  setId: "UNL",
  tags: ["Nami"],
};
