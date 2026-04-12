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
const abilities: Ability[] = [
  {
    effect: {
      effects: [
        { amount: 2, from: "deck", type: "reveal" },
        { target: { type: "card" }, type: "banish" },
        {
          reduceCost: { energy: 2 },
          target: { type: "pending-value" },
          type: "play",
        } as unknown as Effect,
        { amount: 1, type: "draw" },
      ],
      pendingValue: { source: 1 },
      type: "sequence",
    },
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
