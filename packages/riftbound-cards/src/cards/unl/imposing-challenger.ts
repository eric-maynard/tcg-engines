import type { Ability } from "@tcg/riftbound-types/abilities";
import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * "When I move, you may move an enemy unit here with less Might than me to a
 * different battlefield."
 *
 * rule 359.3.f.2 — "here" and "my Might" are read when the instruction executes.
 * rule 740 / 355.9.b — the target must be ENEMY, HERE, and strictly LESS Might.
 * rule 447.2 — "a different battlefield" is never a base and never the
 * battlefield the unit already stands on (`to: "any-battlefield"`).
 */
const abilities: Ability[] = [
  {
    effect: {
      target: {
        controller: "enemy",
        filter: { mightLessThanSelf: true },
        location: "here",
        type: "unit",
      },
      to: "any-battlefield",
      type: "move",
    },
    optional: true,
    trigger: { event: "move", on: "self" },
    type: "triggered",
  } as Ability,
];

export const imposingChallenger: UnitCard = {
  abilities,
  cardNumber: 105,
  cardType: "unit",
  domain: "body",
  energyCost: 5,
  id: createCardId("unl-105-219"),
  might: 5,
  name: "Imposing Challenger",
  rarity: "uncommon",
  rulesText:
    "When I move, you may move an enemy unit here with less Might than me to a different battlefield.",
  setId: "UNL",
};
