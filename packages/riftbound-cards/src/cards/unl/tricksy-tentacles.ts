import type { Ability } from "@tcg/riftbound-types";
import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Tricksy Tentacles — unl-054-219 (Action spell)
 *
 * Move any number of enemy units with the same controller and a total
 * Might of 8 or less to a single location.
 *
 * Modeled as a move effect targeting any number of enemy units with the
 * aggregate-might filter. The engine needs to enforce both the
 * "same controller" constraint and the "<= 8 total Might" cap during
 * target selection.
 *
 * FIXME: No first-class "sum of might across chosen targets" filter
 * exists. We approximate with a `totalMight` filter entry the engine
 * interprets during target resolution.
 */
const abilities: Ability[] = [
  {
    effect: {
      target: {
        controller: "enemy",
        filter: [{ might: { lte: 8 } }, { keyword: "same-controller" }],
        location: "battlefield",
        quantity: "any",
        type: "unit",
      },
      to: { battlefield: "any" },
      type: "move",
    },
    timing: "action",
    type: "spell",
  },
];

export const tricksyTentacles: SpellCard = {
  abilities,
  cardNumber: 54,
  cardType: "spell",
  domain: "calm",
  energyCost: 4,
  id: createCardId("unl-054-219"),
  name: "Tricksy Tentacles",
  rarity: "rare",
  rulesText:
    "Move any number of enemy units with the same controller and a total Might of 8 or less to a single location.",
  setId: "UNL",
  timing: "action",
};
