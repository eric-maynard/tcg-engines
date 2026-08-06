import type { Ability } from "@tcg/riftbound-types";
import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

// rule 702.3 — "Then, if I am at a battlefield, buff all other friendly units
// there": the conditional mass buff is unique to this card, so it is spelled
// out here rather than taught to the parser.
const abilities: Ability[] = [
  {
    effect: {
      effects: [
        { target: "self", type: "buff" },
        {
          condition: { type: "while-at-battlefield" },
          then: {
            target: {
              controller: "friendly",
              excludeSelf: true,
              location: "here",
              quantity: "all",
              type: "unit",
            },
            type: "buff",
          },
          type: "conditional",
        },
      ],
      type: "sequence",
    },
    trigger: { event: "play-self" },
    type: "triggered",
  },
] as unknown as Ability[];

export const peakGuardian: UnitCard = {
  abilities,
  cardNumber: 223,
  cardType: "unit",
  domain: "order",
  energyCost: 6,
  id: createCardId("ogn-223-298"),
  might: 5,
  name: "Peak Guardian",
  rarity: "uncommon",
  rulesText:
    "When you play me, buff me. Then, if I am at a battlefield, buff all other friendly units there. (To buff a unit, give it a +1 [Might] buff if it doesn't already have one.)",
  setId: "OGN",
};
