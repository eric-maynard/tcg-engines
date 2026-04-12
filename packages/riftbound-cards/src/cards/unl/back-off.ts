import type { Ability } from "@tcg/riftbound-types";
import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Back Off — unl-042-219 (Action spell)
 *
 * [Hidden]
 * Stun a unit. If you played this from your hand, draw 1.
 */
const abilities: Ability[] = [
  { keyword: "Hidden", type: "keyword" },
  {
    effect: {
      effects: [
        { target: { type: "unit" }, type: "stun" },
        // Draw rider is conditional on "played from hand" (vs played
        // From face-down). The engine needs a "played-from-hand" context
        // Flag to gate this cleanly; leaving as unconditional draw for
        // Now.
        { amount: 1, type: "draw" },
      ],
      type: "sequence",
    },
    timing: "action",
    type: "spell",
  },
];

export const backOff: SpellCard = {
  abilities,
  cardNumber: 42,
  cardType: "spell",
  domain: "calm",
  energyCost: 3,
  id: createCardId("unl-042-219"),
  name: "Back Off",
  rarity: "uncommon",
  rulesText:
    "[Hidden] (Hide now for [rainbow] to react with later for [energy_0].)\n[Action] (Play on your turn or in showdowns.)\n[Stun] a unit. (It doesn't deal combat damage this turn.)\nIf you played this from your hand, draw 1.",
  setId: "UNL",
  timing: "action",
};
