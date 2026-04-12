import type { Ability } from "@tcg/riftbound-types";
import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Windsinger — sfd-138-221
 *
 * [Hidden]
 * When you play me, you may return another unit at a battlefield with
 * 3 [Might] or less to its owner's hand.
 *
 * Two abilities:
 *  1. Hidden keyword
 *  2. Play-self trigger: optionally bounce another unit with Might <= 3
 *     that is currently at a battlefield
 */
const abilities: Ability[] = [
  { keyword: "Hidden", type: "keyword" },
  {
    effect: {
      target: {
        excludeSelf: true,
        filter: { might: { lte: 3 } },
        location: "battlefield",
        type: "unit",
      },
      type: "return-to-hand",
    },
    optional: true,
    trigger: { event: "play-self" },
    type: "triggered",
  },
];

export const windsinger: UnitCard = {
  abilities,
  cardNumber: 138,
  cardType: "unit",
  domain: "chaos",
  energyCost: 2,
  id: createCardId("sfd-138-221"),
  might: 1,
  name: "Windsinger",
  rarity: "uncommon",
  rulesText:
    "Hidden (Hide now for [rainbow] to react with later for [energy_0].)\nWhen you play me, you may return another unit at a battlefield with 3 [Might] or less to its owner's hand.",
  setId: "SFD",
};
