import type { Ability, Effect } from "@tcg/riftbound-types";
import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Smoke and Mirrors — unl-083-219 (Action spell)
 *
 * [Hidden]
 * "Choose a unit you control and another unit you control at a different
 *  location. If at least one of them has [Temporary], move each to the other's
 *  location. Draw 1."
 *
 * rule 355.8 — the parser only derives the trailing "Draw 1", so hand-author
 * the spell: `swap-locations` names TWO caster-chosen friendly units
 * (`target1`/`target2`, paired at play time — only pairs at different
 * locations are offered). rule 359.3.e — the [Temporary] gate applies to the
 * movement alone; the draw happens either way.
 */
const abilities: Ability[] = [
  { keyword: "Hidden", type: "keyword" },
  {
    effect: {
      requireKeywordOnEither: "Temporary",
      target1: { controller: "friendly", type: "unit" },
      target2: { controller: "friendly", type: "unit" },
      then: { amount: 1, type: "draw" },
      type: "swap-locations",
    } as unknown as Effect,
    timing: "action",
    type: "spell",
  },
];

export const smokeAndMirrors: SpellCard = {
  abilities,
  cardNumber: 83,
  cardType: "spell",
  domain: "mind",
  energyCost: 2,
  id: createCardId("unl-083-219"),
  name: "Smoke and Mirrors",
  rarity: "rare",
  rulesText:
    "[Hidden] (Hide now for [rainbow] to react with later for [energy_0].)\n[Action] (Play on your turn or in showdowns.)\nChoose a unit you control and another unit you control at a different location. If at least one of them has [Temporary], move each to the other's location. Draw 1.",
  setId: "UNL",
  timing: "action",
};
