import type { Ability } from "@tcg/riftbound-types";
import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Kinkou Initiate — unl-097-219
 *
 * When you play me, draw 1 if your other units have total Might 5 or more.
 *
 * rule 359 (ruling b9b46d9b72575d2e) — the "if" is written AFTER the
 * instruction, so it is part of the EFFECT and is read when the ability
 * RESOLVES, not an intervening-if that gates the trigger (383.2.a.1). That is
 * what lets a "when you play a unit" trigger ordered above this one (e.g. the
 * Pridestalker legend's +1 [Might]) push the total to 5 in time. The parser
 * hoists a trailing "if" onto the trigger, so the ability is spelled out here.
 */
const abilities: Ability[] = [
  {
    effect: {
      condition: { amount: 5, scope: "other-units", type: "total-might-at-least" },
      then: { amount: 1, type: "draw" },
      type: "conditional",
    },
    trigger: { event: "play-self" },
    type: "triggered",
  } as unknown as Ability,
];

export const kinkouInitiate: UnitCard = {
  abilities,
  cardNumber: 97,
  cardType: "unit",
  domain: "body",
  energyCost: 3,
  id: createCardId("unl-097-219"),
  might: 3,
  name: "Kinkou Initiate",
  rarity: "common",
  rulesText: "When you play me, draw 1 if your other units have total Might 5 or more.",
  setId: "UNL",
};
