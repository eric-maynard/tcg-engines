import type { Ability } from "@tcg/riftbound-types";
import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Grim Resolve — unl-095-219
 *
 * "Give a friendly unit +3 [Might] this turn. When it wins a combat this
 *  turn, gain 2 XP."
 *
 * Rule 364.3: the second sentence installs a turn-scoped triggered ability on
 * the SAME unit the buff chose, so both steps share one target descriptor.
 */
const TARGET = { controller: "friendly", type: "unit" } as const;

const abilities: Ability[] = [
  {
    effect: {
      effects: [
        { amount: 3, duration: "turn", target: TARGET, type: "modify-might" },
        {
          duration: "turn",
          effect: { amount: 2, type: "gain-xp" },
          target: TARGET,
          trigger: { event: "win-combat", on: "self" },
          type: "delayed-trigger",
        },
      ],
      type: "sequence",
    },
    timing: "action",
    type: "spell",
  },
] as unknown as Ability[];

export const grimResolve: SpellCard = {
  abilities,
  cardNumber: 95,
  cardType: "spell",
  domain: "body",
  energyCost: 2,
  id: createCardId("unl-095-219"),
  name: "Grim Resolve",
  rarity: "common",
  rulesText:
    "[Action] (Play on your turn or in showdowns.)\nGive a friendly unit +3 [Might] this turn. When it wins a combat this turn, gain 2 XP.",
  setId: "UNL",
  timing: "action",
};
