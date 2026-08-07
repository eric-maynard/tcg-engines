import type { Ability } from "@tcg/riftbound-types";
import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Determined Sentry — unl-111-219
 *
 * "I can't move to base."
 *
 * Modeled as a static grant of the shared `NoMoveToBase` marker keyword on self —
 * the same marker the movement moves and the move effect consult (144.4.b, 410.1.b.3).
 */
const abilities: Ability[] = [
  {
    effect: {
      keyword: "NoMoveToBase",
      target: "self",
      type: "grant-keyword",
    },
    type: "static",
  },
];

export const determinedSentry: UnitCard = {
  abilities,
  cardNumber: 111,
  cardType: "unit",
  domain: "body",
  energyCost: 1,
  id: createCardId("unl-111-219"),
  might: 1,
  name: "Determined Sentry",
  rarity: "rare",
  rulesText: "I can't move to base.",
  setId: "UNL",
};
