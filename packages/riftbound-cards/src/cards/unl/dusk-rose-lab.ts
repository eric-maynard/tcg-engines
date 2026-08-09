import type { Ability } from "@tcg/riftbound-types";
import type { BattlefieldCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Dusk Rose Lab — unl-209-219
 *
 * "At the start of your Beginning Phase, you may kill a unit you control
 *  here to draw 1."
 */
// rule 383.3.b / 204.3.a / 740.4.a.2 — "kill a unit you control here TO draw
// 1": the kill is the trigger's BASE COST (a cost object, 355.10.c.1 — chosen
// and paid while the item is finalized, before anyone has Priority); only the
// draw is the effect.
const abilities: Ability[] = [
  {
    condition: {
      cost: { kill: { target: { controller: "friendly", location: "here", type: "unit" } } },
      type: "pay-cost",
    } as never,
    effect: { amount: 1, type: "draw" },
    optional: true,
    trigger: {
      event: "beginning-phase",
      on: "controller",
      timing: "at",
    },
    type: "triggered",
  },
];

export const duskRoseLab: BattlefieldCard = {
  abilities,
  cardNumber: 209,
  cardType: "battlefield",
  id: createCardId("unl-209-219"),
  name: "Dusk Rose Lab",
  rarity: "uncommon",
  rulesText:
    "At the start of your Beginning Phase, you may kill a unit you control here to draw 1. (This happens before scoring.)",
  setId: "UNL",
};
