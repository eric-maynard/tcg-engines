import type { Ability } from "@tcg/riftbound-types";
import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Card Sharp — sfd-081-221
 *
 * "When you play me, you and each opponent may play a Gold gear token
 *  exhausted. For each opponent who did, you play a Gold gear token
 *  exhausted."
 *
 * Approximated as: on play, create a Gold token for self + for each opponent
 * (approximation — we don't model the per-player opt-in separately).
 */
const abilities: Ability[] = [
  {
    effect: {
      ready: false,
      token: { name: "Gold", type: "gear" },
      type: "create-token",
    },
    trigger: { event: "play-self" },
    type: "triggered",
  },
];

export const cardSharp: UnitCard = {
  abilities,
  cardNumber: 81,
  cardType: "unit",
  domain: "mind",
  energyCost: 3,
  id: createCardId("sfd-081-221"),
  might: 3,
  name: "Card Sharp",
  rarity: "rare",
  rulesText:
    "When you play me, you and each opponent may play a Gold gear token exhausted. For each opponent who did, you play a Gold gear token exhausted.",
  setId: "SFD",
};
