import type { Ability } from "@tcg/riftbound-types";
import type { Effect } from "@tcg/riftbound-types/abilities/effect-types";
import type { LegendCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * "When you conquer, you may exhaust me to reveal the top 2 cards of your Main
 *  Deck. You may banish one, then play it. Recycle the rest."
 *
 * Same reveal-and-pick shape as Void Rush (sfd-188-221), but this card prints
 * NO cost reduction (rule 419.2.a: the banished card is played for its full
 * cost) and the leftovers are recycled (416) rather than drawn.
 */
const abilities: Ability[] = [
  {
    condition: { cost: { exhaust: true }, type: "pay-cost" },
    effect: {
      amount: 2,
      from: "deck",
      onPicked: "play",
      onRest: "recycle",
      optional: true,
      // rule 424 — a public reveal from the deck, not a private look.
      reveal: true,
      type: "look",
    } as unknown as Effect,
    optional: true,
    trigger: { event: "conquer", on: "controller" },
    type: "triggered",
  } as unknown as Ability,
];

export const voidBurrower: LegendCard = {
  abilities,
  cardNumber: 187,
  cardType: "legend",
  championTag: "Rek'Sai",
  domain: ["fury", "order"],
  id: createCardId("sfd-187-221"),
  name: "Void Burrower",
  rarity: "rare",
  rulesText:
    "When you conquer, you may exhaust me to reveal the top 2 cards of your Main Deck. You may banish one, then play it. Recycle the rest.",
  setId: "SFD",
};
