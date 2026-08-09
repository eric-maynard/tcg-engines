import type { Ability } from "@tcg/riftbound-types";
import type { LegendCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Virtuoso — unl-181-219 (Legend, Jhin)
 *
 * "When you play a spell, if you spent [4] or more, you may banish it. Then, if
 * there are four spells banished with me, put each in its trash, channel 4
 * runes, and draw 1."
 *
 * rule 419.4.a — the trigger fires as the spell finishes resolving, so "it"
 * (`trigger-source`) is the spell, already in its owner's trash.
 * rule 135/202 — "spent [4]" is the Energy actually paid for THAT spell.
 * rule 397 — "banished WITH ME" is the ability's own link list, so the banish
 * asks for `trackLinked` and the follow-up counts only that list.
 */
const abilities: Ability[] = [
  {
    condition: { amount: 4, type: "spell-energy-spent" },
    effect: {
      effects: [
        { target: { type: "trigger-source" }, trackLinked: true, type: "banish" },
        {
          condition: {
            comparison: { gte: 4 },
            target: { linkedToSource: true, location: "banishment", type: "card" },
            type: "count",
          },
          then: {
            effects: [
              { type: "linked-banished-to-trash" },
              { amount: 4, type: "channel" },
              { amount: 1, type: "draw" },
            ],
            type: "sequence",
          },
          type: "conditional",
        },
      ],
      type: "sequence",
    },
    optional: true,
    trigger: { event: "play-spell", on: "controller" },
    type: "triggered",
  },
];

export const virtuoso: LegendCard = {
  abilities,
  cardNumber: 181,
  cardType: "legend",
  championTag: "Jhin",
  domain: ["fury", "mind"],
  id: createCardId("unl-181-219"),
  name: "Virtuoso",
  rarity: "rare",
  rulesText:
    "When you play a spell, if you spent [4] or more, you may banish it. Then, if there are four spells banished with me, put each in its trash, channel 4 runes, and draw 1.",
  setId: "UNL",
};
