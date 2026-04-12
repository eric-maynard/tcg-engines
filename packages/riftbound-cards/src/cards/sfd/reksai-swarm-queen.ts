import type { Ability } from "@tcg/riftbound-types";
import type { Effect } from "@tcg/riftbound-types/abilities/effect-types";
import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Rek'Sai, Swarm Queen — sfd-170-221
 *
 * "When I attack, you may reveal the top 2 cards of your Main Deck. You may
 *  banish one, then play it. If it is a unit, you may play it here. Recycle
 *  the rest."
 *
 * Modeled as a triggered sequence: reveal 2, banish one (pending-value), play
 * it (with "here" as the target location if it's a unit), recycle rest.
 */
const abilities: Ability[] = [
  {
    effect: {
      effects: [
        { amount: 2, from: "deck", type: "reveal" },
        { target: { type: "card" }, type: "banish" },
        {
          ignoreCost: true,
          target: { type: "pending-value" },
          toLocation: "here",
          type: "play",
        } as unknown as Effect,
        { amount: 1, from: "board", type: "recycle" },
      ],
      pendingValue: { source: 1 },
      type: "sequence",
    },
    optional: true,
    trigger: { event: "attack", on: "self" },
    type: "triggered",
  },
];

export const reksaiSwarmQueen: UnitCard = {
  abilities,
  cardNumber: 170,
  cardType: "unit",
  domain: "order",
  energyCost: 5,
  id: createCardId("sfd-170-221"),
  isChampion: true,
  might: 5,
  name: "Rek'Sai, Swarm Queen",
  rarity: "rare",
  rulesText:
    "When I attack, you may reveal the top 2 cards of your Main Deck. You may banish one, then play it. If it is a unit, you may play it here. Recycle the rest.",
  setId: "SFD",
  tags: ["Rek'Sai"],
};
