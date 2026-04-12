import type { Ability } from "@tcg/riftbound-types";
import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Curtain Call — unl-182-219 (Action spell)
 *
 * [Repeat] — [1] / [rainbow] / [1][rainbow]
 * Choose one you haven't already chosen —
 *   Draw 1.
 *   Deal 2 to a unit at a battlefield.
 *   Deal 3 to a unit at a base.
 *   Give a unit at a battlefield -4 [Might] this turn.
 *
 * Modelled as a choice spell with the `repeat` field capturing one of
 * the three escalating repeat costs (the engine approximates this as the
 * cheapest for scheduling — full multi-tier repeat costs are pending).
 */
const abilities: Ability[] = [
  {
    effect: {
      notChosenThisTurn: true,
      options: [
        { effect: { amount: 1, type: "draw" } },
        {
          effect: {
            amount: 2,
            target: { location: "battlefield", type: "unit" },
            type: "damage",
          },
        },
        {
          effect: {
            amount: 3,
            target: { location: "base", type: "unit" },
            type: "damage",
          },
        },
        {
          effect: {
            amount: -4,
            duration: "turn",
            target: { location: "battlefield", type: "unit" },
            type: "modify-might",
          },
        },
      ],
      type: "choice",
    },
    repeat: { energy: 1 },
    timing: "action",
    type: "spell",
  },
];

export const curtainCall: SpellCard = {
  abilities,
  cardNumber: 182,
  cardType: "spell",
  domain: ["fury", "mind"],
  energyCost: 4,
  id: createCardId("unl-182-219"),
  name: "Curtain Call",
  rarity: "epic",
  rulesText:
    "[Repeat] — [1] / [rainbow] / [1][rainbow] (You may pay each additional cost to repeat this spell's effect.)\nChoose one you haven't already chosen —Draw 1.Deal 2 to a unit at a battlefield.Deal 3 to a unit at a base.Give a unit at a battlefield -4 [Might] this turn.",
  setId: "UNL",
  timing: "action",
};
