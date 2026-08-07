import type { Ability } from "@tcg/riftbound-types";
import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

// rule 142.4.c: this card is the rules' example — the passive lowers the
// lethal-damage value of ENEMY units to 1 for damage its controller dealt.
const abilities: Ability[] = [
  {
    effect: {
      target: { controller: "enemy", type: "unit" },
      type: "lethal-damage-modifier",
      value: 1,
    },
    type: "static",
  },
  // rule 106 / 355.13: "up to one enemy unit at EACH location" — every base and
  // every battlefield is its own location, and zero picks is a legal answer.
  {
    effect: {
      candidates: { controller: "enemy", type: "unit" },
      effect: { amount: 1, type: "damage" },
      type: "choose-per-location",
    },
    trigger: { event: "play-self", on: "self" },
    type: "triggered",
  },
] as unknown as Ability[];

export const elderDragon: UnitCard = {
  abilities,
  cardNumber: 118,
  cardType: "unit",
  domain: "body",
  energyCost: 12,
  id: createCardId("unl-118-219"),
  might: 10,
  name: "Elder Dragon",
  rarity: "epic",
  rulesText:
    "Any amount of your damage is enough to kill enemy units.\nWhen you play me, choose up to one enemy unit at each location. Deal 1 to them.",
  setId: "UNL",
  tags: ["Dragon"], // printed DRAGON tag (missing from set data)
};
