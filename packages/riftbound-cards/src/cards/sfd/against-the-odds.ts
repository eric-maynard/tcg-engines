import type { Ability } from "@tcg/riftbound-types";
import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Against the Odds — sfd-001-221 (Reaction spell)
 *
 * Give a friendly unit at a battlefield +2 [Might] this turn for each
 * enemy unit there.
 *
 * Encoded as modify-might with amount = +2 per enemy unit here, using the
 * AmountExpression `multiplier` field on the count variant.
 */
const abilities: Ability[] = [
  {
    effect: {
      amount: {
        count: {
          controller: "enemy",
          location: "here",
          type: "unit",
        },
        multiplier: 2,
      },
      duration: "turn",
      target: {
        controller: "friendly",
        location: "battlefield",
        type: "unit",
      },
      type: "modify-might",
    },
    timing: "reaction",
    type: "spell",
  },
];

export const againstTheOdds: SpellCard = {
  abilities,
  cardNumber: 1,
  cardType: "spell",
  domain: "fury",
  energyCost: 2,
  id: createCardId("sfd-001-221"),
  name: "Against the Odds",
  rarity: "common",
  rulesText:
    "[Reaction] (Play any time, even before spells and abilities resolve.)\nGive a friendly unit at a battlefield +2 [Might] this turn for each enemy unit there.",
  setId: "SFD",
  timing: "reaction",
};
