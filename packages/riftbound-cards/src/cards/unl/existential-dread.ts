import type { Ability } from "@tcg/riftbound-types";
import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

// rule 423.1.a.1 — a stunned unit can be chosen again but is not "stunned
// again"; this card turns that case into a bounce. The parser has no form for
// "<effect> X. If it's already stunned, <other effect> instead", so the
// conditional is authored here. Both branches read the same chosen target.
const ATTACKING_ENEMY_UNIT = { controller: "enemy", filter: "attacking", type: "unit" } as const;

const stunOrBounce: Ability[] = [
  {
    effect: {
      condition: { type: "target-stunned" },
      else: { target: ATTACKING_ENEMY_UNIT, type: "stun" },
      target: ATTACKING_ENEMY_UNIT,
      then: { target: ATTACKING_ENEMY_UNIT, type: "return-to-hand" },
      type: "conditional",
    },
    repeat: { energy: 2 },
    timing: "action",
    type: "spell",
  },
] as unknown as Ability[];

export const existentialDread: SpellCard = {
  abilities: stunOrBounce,
  cardNumber: 134,
  cardType: "spell",
  domain: "chaos",
  energyCost: 1,
  id: createCardId("unl-134-219"),
  name: "Existential Dread",
  rarity: "uncommon",
  rulesText:
    "[Action] (Play on your turn or in showdowns.)\n[Repeat] [2] (You may pay the additional cost to repeat this spell's effect.)\n[Stun] an attacking enemy unit. If it's already stunned, return it to its owner's hand instead. (A stunned unit doesn't deal combat damage this turn.)",
  setId: "UNL",
  timing: "action",
};
