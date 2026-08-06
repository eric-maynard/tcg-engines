import type { Ability } from "@tcg/riftbound-types";
import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Stand United — ogn-053-298 (Action spell)
 *
 * [Hidden]
 * Buff a friendly unit. Buffs give an additional +1 [Might] to friendly
 * units this turn.
 *
 * rule 364.3 / 517.2.b: the second sentence is a turn-scoped continuous
 * effect — every buffed friendly unit (now or later this turn) is +1 more.
 */
const abilities: Ability[] = [
  { keyword: "Hidden", type: "keyword" },
  {
    effect: {
      effects: [
        { target: { controller: "friendly", type: "unit" }, type: "buff" },
        {
          effect: {
            amount: 1,
            target: { controller: "friendly", filter: "buffed", type: "unit" },
            type: "modify-might",
          },
          type: "turn-static",
        },
      ],
      type: "sequence",
    },
    timing: "action",
    type: "spell",
  },
];

export const standUnited: SpellCard = {
  abilities,
  cardNumber: 53,
  cardType: "spell",
  domain: "calm",
  energyCost: 3,
  id: createCardId("ogn-053-298"),
  name: "Stand United",
  rarity: "common",
  rulesText:
    "[Hidden] (Hide now for [rainbow] to react with later for [energy_0].)\n[Action] (Play on your turn or in showdowns.)\nBuff a friendly unit. Buffs give an additional +1 [Might] to friendly units this turn. (To buff a unit, give it a +1 [Might] buff if it doesn't already have one.)",
  setId: "OGN",
  timing: "action",
};
