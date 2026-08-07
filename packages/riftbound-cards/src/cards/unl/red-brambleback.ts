import type { Ability } from "@tcg/riftbound-types";
import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Red Brambleback — unl-029-219
 *
 * "Your conquer effects for conquering here trigger an additional time."
 *
 * rule 383.3.d / 383.4.c — a controller-scoped doubler for conquer effects,
 * limited to conquers of the battlefield Brambleback itself occupies. The
 * phrasing is unique to this card, so the shape is declared here rather than
 * taught to the parser; the engine reads it in `trigger-runner.ts`.
 */
const abilities: Ability[] = [
  {
    cost: { energy: 1, power: ["fury"] },
    keyword: "Accelerate",
    type: "keyword",
  },
  {
    effect: {
      event: "conquer",
      location: "here",
      type: "trigger-double",
    } as unknown as Ability["effect"],
    type: "static",
  } as Ability,
  {
    effect: {
      target: { controller: "friendly", type: "unit" },
      type: "buff",
    },
    trigger: { event: "conquer", on: "self" },
    type: "triggered",
  },
];

export const redBrambleback: UnitCard = {
  abilities,
  cardNumber: 29,
  cardType: "unit",
  domain: "fury",
  energyCost: 4,
  id: createCardId("unl-029-219"),
  might: 4,
  name: "Red Brambleback",
  rarity: "epic",
  rulesText:
    "[Accelerate] (You may pay [1][fury] as an additional cost to have me enter ready.)\nYour conquer effects for conquering here trigger an additional time.\nWhen I conquer, [Buff] a friendly unit. (Give it a +1 [Might] buff if it doesn't have one.)",
  setId: "UNL",
};
