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
      owner: "any",
      // rule 355.10.a.1 — a trash is a PUBLIC zone, so "up to 4 cards from
      // trashes" is an ordinary variable-count target set: it is named while the
      // ability is finalized on the chain (355.5 / 355.13 / 402.2) and locked
      // there (355.15), never gathered again as the ability resolves.
      // rules 402 / 404.1 — for an activated ability "Make relevant choices" is
      // step 2 and "Pay Costs" is step 4 (357.2 is the card-play analogue), so
      // the "Kill this" cost is paid AFTER this set is chosen: the Forge is
      // still a gear on the board at choice time and can never be one of its
      // own targets (`excludeSelf`).
      target: {
        controller: "any",
        excludeSelf: true,
        location: "trash",
        quantity: { upTo: 4 },
        type: "card",
      },
      type: "recycle",
      upTo: true,
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
