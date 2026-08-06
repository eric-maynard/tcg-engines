import type { Ability, Effect } from "@tcg/riftbound-types";
import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

// rule-id: unl-107-219 — Rule 355.8 / 355.2: the parser only derives the
// trailing "Gain 1 XP." and drops the choose-unit + choose-battlefield move, so
// hand-author the spell. `reference` is the caster-chosen friendly unit (bound
// at play time as targets[0]); the chosen battlefield card id rides as
// targets[1] (prompted at resolution when unbound). The engine moves every
// enemy unit at that battlefield with Might < reference's Might to base.
const abilities: Ability[] = [
  {
    effect: {
      effects: [
        {
          from: "chosen-battlefield",
          reference: { controller: "friendly", type: "unit" },
          target: { controller: "enemy", quantity: "all", type: "unit" },
          to: "base",
          type: "move",
        },
        { amount: 1, type: "gain-xp" },
      ],
      type: "sequence",
    } as unknown as Effect,
    timing: "action",
    type: "spell",
  },
];

export const stareDown: SpellCard = {
  abilities,
  cardNumber: 107,
  cardType: "spell",
  domain: "body",
  energyCost: 2,
  id: createCardId("unl-107-219"),
  name: "Stare Down",
  rarity: "uncommon",
  rulesText:
    "Choose a friendly unit and a battlefield. Move all enemy units at that battlefield with less Might than the chosen unit to their base. Gain 1 XP.",
  setId: "UNL",
  timing: "action",
};
