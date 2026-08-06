import type { Ability } from "@tcg/riftbound-types";
import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Crescent Strike — unl-072-219 (Action spell)
 *
 * Choose a battlefield and an enemy unit there. Deal 4 to that unit and 1 to
 * each other enemy unit there.
 */
// rule-id: unl-072-219 — the parser read "there" as "here" and collapsed this
// into "4 to all enemy units here". The caster picks ONE enemy unit at a
// battlefield (rule 355.8, locked at play time); it takes 4 and every other
// enemy unit at that same battlefield takes 1 (`splashOthers`).
const abilities: Ability[] = [
  {
    effect: {
      amount: 4,
      splashOthers: 1,
      target: { controller: "enemy", location: "battlefield", type: "unit" },
      type: "damage",
    },
    timing: "action",
    type: "spell",
  },
];

export const crescentStrike: SpellCard = {
  abilities,
  cardNumber: 72,
  cardType: "spell",
  domain: "mind",
  energyCost: 3,
  id: createCardId("unl-072-219"),
  name: "Crescent Strike",
  rarity: "uncommon",
  rulesText:
    "[Action] (Play on your turn or in showdowns.)\nChoose a battlefield and an enemy unit there. Deal 4 to that unit and 1 to each other enemy unit there.",
  setId: "UNL",
  timing: "action",
};
