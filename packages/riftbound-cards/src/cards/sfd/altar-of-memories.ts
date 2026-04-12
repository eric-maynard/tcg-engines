import type { Ability } from "@tcg/riftbound-types";
import type { GearCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Altar of Memories — sfd-169-221
 *
 * "When a friendly unit dies, you may exhaust me to draw 1, then put a card
 *  from your hand on the top or bottom of your Main Deck."
 *
 * Modeled as an optional triggered ability on friendly-unit death. The
 * `pay-cost` condition covers the exhaust. The effect sequences: draw 1,
 * then recycle/move a card from hand back to the deck. We use `recycle`
 * from="hand" as the closest approximation of "put a card from your hand on
 * top or bottom of your deck".
 */
const abilities: Ability[] = [
  {
    condition: { cost: { exhaust: true }, type: "pay-cost" },
    effect: {
      effects: [
        { amount: 1, type: "draw" },
        { amount: 1, from: "hand", type: "recycle" },
      ],
      type: "sequence",
    },
    optional: true,
    trigger: { event: "die", on: "friendly-units" },
    type: "triggered",
  },
];

export const altarOfMemories: GearCard = {
  abilities,
  cardNumber: 169,
  cardType: "gear",
  domain: "order",
  energyCost: 2,
  id: createCardId("sfd-169-221"),
  name: "Altar of Memories",
  rarity: "rare",
  rulesText:
    "When a friendly unit dies, you may exhaust me to draw 1, then put a card from your hand on the top or bottom of your Main Deck.",
  setId: "SFD",
};
