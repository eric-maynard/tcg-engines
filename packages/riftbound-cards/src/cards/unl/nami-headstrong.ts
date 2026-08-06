import type { Ability } from "@tcg/riftbound-types";
import type { Effect } from "@tcg/riftbound-types/abilities/effect-types";
import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Nami, Headstrong — unl-052-219
 *
 * - Optional additional cost: pay [calm].
 * - When played, if paid, stun an enemy unit.
 * - When I hold, the next unit you play this turn enters ready with a buff.
 *
 * Modeled as a static `additional-cost-option` ability (so the engine's
 * getOptionalPlayCost offers the [calm] payment at play time) plus two
 * triggered abilities: the stun on play (gated on paid additional cost) and
 * a hold-trigger that installs a one-shot `enters-ready` replacement (with a
 * Buff rider) applied to the next friendly unit played this turn.
 */
const abilities: Ability[] = [
  {
    // Rule 560 — optional "you may pay [calm]" additional cost; without this
    // the paid-additional-cost condition below can never be satisfied.
    effect: {
      additionalCost: { power: ["calm"] },
      optional: true,
      type: "additional-cost-option",
    } as unknown as Effect,
    type: "static",
  },
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
    // rule-id: unl-052-219 — "the next time you play a unit this turn, ready
    // it and Buff it": install a single-fire `enters-ready` replacement with a
    // Buff rider (consumed by consumeEntersReadyReplacement on the next
    // friendly unit played — the installed entry is owner-scoped; expires at
    // end of turn) instead of readying/buffing an existing unit immediately.
    // No `target` so resolution never prompts to choose an existing unit.
    effect: {
      buff: true,
      duration: "next",
      replaces: "enters-ready",
      type: "replacement",
    } as unknown as Effect,
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
