import type { Ability, Effect } from "@tcg/riftbound-types";
import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

// rule-id: unl-124-219 — the parser only yields the move and drops the
// "Then, if there's an enemy unit alone at that battlefield, draw 1" clause.
// "That battlefield" is the moved unit's origin, which only the move handler
// knows, so the conditional draw rides on the move via
// `thenIfEnemyAloneAtOrigin`. "From a battlefield" must be target.location —
// the parser's separate `from` field is ignored, letting base units be chosen.
const abilities: Ability[] = [
  {
    effect: {
      target: { controller: "enemy", location: "battlefield", type: "unit" },
      thenIfEnemyAloneAtOrigin: { amount: 1, type: "draw" },
      to: "base",
      type: "move",
    } as unknown as Effect,
    timing: "action",
    type: "spell",
  },
];

export const isolate: SpellCard = {
  abilities,
  cardNumber: 124,
  cardType: "spell",
  domain: "chaos",
  energyCost: 2,
  id: createCardId("unl-124-219"),
  name: "Isolate",
  rarity: "common",
  rulesText:
    "Move an enemy unit from a battlefield to its base. Then, if there's an enemy unit alone at that battlefield, draw 1.",
  setId: "UNL",
  timing: "action",
};
