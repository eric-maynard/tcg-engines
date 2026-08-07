import type { Ability } from "@tcg/riftbound-types";
import type { Effect } from "@tcg/riftbound-types/abilities/effect-types";
import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Void Rush — sfd-188-221
 *
 * "Reveal the top 2 cards of your Main Deck. You may banish one, then play
 *  it, reducing its cost by [2]. Draw any you didn't banish."
 *
 * Modeled as a sequence: reveal 2, banish one (optional), play it at -2
 * energy, draw the rest.
 */
// rule 354.2 / 356.4 (rule-id: ogn-062-298-look-banish-play) — the pick is made
// among the two revealed cards as the spell resolves, so this uses the
// reveal-and-pick shape (`look … onPicked:"play"`) rather than a board target:
// the optional pick is banished and played at [2] less, and everything left
// over is drawn.
const abilities: Ability[] = [
  {
    effect: {
      amount: 2,
      from: "deck",
      onPicked: "play",
      onRest: "draw",
      optional: true,
      reduceCost: { energy: 2 },
      // rule 424 — this is a public REVEAL from a deck, not a private look, so
      // reveal replacements (Void Hatchling, sfd-018-221) can see it.
      reveal: true,
      type: "look",
    } as unknown as Effect,
    timing: "action",
    type: "spell",
  },
];

export const voidRush: SpellCard = {
  abilities,
  cardNumber: 188,
  cardType: "spell",
  domain: ["fury", "order"],
  energyCost: 2,
  id: createCardId("sfd-188-221"),
  name: "Void Rush",
  rarity: "epic",
  rulesText:
    "Reveal the top 2 cards of your Main Deck. You may banish one, then play it, reducing its cost by [2]. Draw any you didn't banish.",
  setId: "SFD",
  timing: "action",
};
