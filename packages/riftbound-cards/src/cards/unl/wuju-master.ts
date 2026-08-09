import type { Ability } from "@tcg/riftbound-types";
import type { LegendCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Wuju Master — unl-191-219
 *
 *   [Level 6][>] Your units have +1 [Might].
 *   [Level 11][>] Your units enter ready.
 *
 * rule 824: each Level line is Active only while the controller has that much
 * XP, so both lines are statics carrying a `while-level` condition.
 * rule 143.4 / 369.3: "your units enter ready" replaces the default
 * enters-exhausted entry for units their controller plays — the play path
 * reads it (`cost.ts boardEntersReadyGrantApplies`), not the static layer.
 */
const abilities: Ability[] = [
  {
    condition: { threshold: 6, type: "while-level" },
    effect: {
      amount: 1,
      target: { controller: "friendly", type: "unit" },
      type: "modify-might",
    },
    type: "static",
  },
  {
    condition: { threshold: 11, type: "while-level" },
    effect: {
      target: { controller: "friendly", type: "unit" },
      type: "enter-ready",
    },
    type: "static",
  },
] as unknown as Ability[];

export const wujuMaster: LegendCard = {
  abilities,
  cardNumber: 191,
  cardType: "legend",
  championTag: "Master Yi",
  domain: ["calm", "body"],
  id: createCardId("unl-191-219"),
  name: "Wuju Master",
  rarity: "rare",
  rulesText:
    "[Level 6][&gt;] Your units have +1 [Might]. (While you have 6+ XP, get the effect.)\n[Level 11][&gt;] Your units enter ready.",
  setId: "UNL",
};
