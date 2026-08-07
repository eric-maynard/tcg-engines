import type { Ability } from "@tcg/riftbound-types";
import type { Effect } from "@tcg/riftbound-types/abilities/effect-types";
import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Stalking Wolf — unl-166-219
 *
 * [Ambush]
 * As an additional cost to play me, kill a Bird/Cat/Dog/Poro you
 * control. You may play me to its battlefield.
 *
 * rule 356.2.a.1 / 204.2 — the kill carries no "may", so it is a MANDATORY
 * additional cost: with no Bird/Cat/Dog/Poro under your control the Wolf
 * cannot be played at all. rule 355.10.c — the victim is a cost, not a
 * target, so only pets YOU control qualify. The tag list is a disjunction.
 */
const abilities: Ability[] = [
  {
    effect: {
      keyword: "Ambush",
      target: "self",
      type: "grant-keyword",
    },
    type: "static",
  },
  {
    effect: {
      additionalCost: {
        kill: {
          controller: "friendly",
          filter: { tag: ["Bird", "Cat", "Dog", "Poro"] },
          type: "unit",
        },
      },
      optional: false,
      type: "additional-cost-option",
    } as unknown as Effect,
    type: "static",
  },
];

export const stalkingWolf: UnitCard = {
  abilities,
  cardNumber: 166,
  cardType: "unit",
  domain: "order",
  energyCost: 4,
  id: createCardId("unl-166-219"),
  might: 6,
  name: "Stalking Wolf",
  rarity: "uncommon",
  rulesText:
    "[Ambush] (You may play me as a [Reaction] to a battlefield where you have units.)\nAs an additional cost to play me, kill a Bird, Cat, Dog, or Poro you control. You may play me to its battlefield (even if you don't have other units there).",
  setId: "UNL",
};
