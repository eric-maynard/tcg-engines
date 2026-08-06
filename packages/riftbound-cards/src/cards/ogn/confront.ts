import type { Ability } from "@tcg/riftbound-types";
import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

// rule 143.4 / 369.3 — units normally enter exhausted; Confront installs a
// turn-long `enters-ready` replacement for every unit its controller plays
// (not just the next one, so `duration: "turn"`). The parser only handles the
// "next unit" single-fire phrasing, so state the ability here.
const abilities: Ability[] = [
  {
    effect: {
      effects: [
        {
          // No `target` descriptor: this is not a caster-chosen target, and a
          // unit descriptor would make the spell uncastable with an empty board
          // (rule 355.8 legal-target gate in play-spell). `owner` scoping in
          // consumeEntersReadyReplacement already limits it to "units you play".
          duration: "turn",
          replaces: "enters-ready",
          type: "replacement",
        },
        { amount: 1, type: "draw" },
      ],
      type: "sequence",
    },
    timing: "action",
    type: "spell",
  } as Ability,
];

export const confront: SpellCard = {
  abilities,
  cardNumber: 129,
  cardType: "spell",
  domain: "body",
  energyCost: 2,
  id: createCardId("ogn-129-298"),
  name: "Confront",
  rarity: "common",
  rulesText:
    "[Action] (Play on your turn or in showdowns.)\nUnits you play this turn enter ready. Draw 1.",
  setId: "OGN",
  timing: "action",
};
