import type { Ability } from "@tcg/riftbound-types";
import type { GearCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Forge of the Future — ogn-212-298
 *
 * When you play this, play a 1 [Might] Recruit unit token at your base.
 * Kill this: Recycle up to 4 cards from trashes.
 *
 * Two abilities:
 *  1. play-self trigger: creates a 1-might Recruit token at base
 *  2. activated ability: kill self, recycle up to 4 cards from trashes
 */
const abilities: Ability[] = [
  {
    effect: {
      location: "base",
      token: { might: 1, name: "Recruit", type: "unit" },
      type: "create-token",
    },
    trigger: { event: "play-self" },
    type: "triggered",
  },
  {
    cost: { kill: "self" },
    effect: {
      amount: 4,
      from: "trash",
      type: "recycle",
    },
    type: "activated",
  },
];

export const forgeOfTheFuture: GearCard = {
  abilities,
  cardNumber: 212,
  cardType: "gear",
  domain: "order",
  energyCost: 2,
  id: createCardId("ogn-212-298"),
  name: "Forge of the Future",
  rarity: "common",
  rulesText:
    "When you play this, play a 1 [Might] Recruit unit token at your base.\nKill this: Recycle up to 4 cards from trashes.",
  setId: "OGN",
};
