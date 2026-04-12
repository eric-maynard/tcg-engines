import type { Ability } from "@tcg/riftbound-types";
import type { LegendCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Blade Dancer — sfd-195-221 (Legend, Irelia)
 *
 * Ability 1: When you choose a friendly unit, you may exhaust me
 *            and pay [rainbow] to ready it.
 *   - Trigger: "choose" event on any friendly unit (not self)
 *   - Cost: exhaust self + pay rainbow power
 *   - Effect: ready the chosen (triggering) unit
 *
 * Ability 2: When you conquer, you may pay [1] to ready me.
 *   - Trigger: "conquer" event on controller
 *   - Cost: pay 1 energy
 *   - Effect: ready self
 */
const abilities: Ability[] = [
  {
    condition: {
      cost: { exhaust: true, power: ["rainbow"] },
      type: "pay-cost",
    },
    effect: {
      target: { type: "trigger-source" },
      type: "ready",
    },
    optional: true,
    trigger: {
      event: "choose",
      on: { cardType: "unit", controller: "friendly" },
    },
    type: "triggered",
  },
  {
    condition: {
      cost: { energy: 1 },
      type: "pay-cost",
    },
    effect: {
      target: "self",
      type: "ready",
    },
    optional: true,
    trigger: {
      event: "conquer",
      on: "controller",
    },
    type: "triggered",
  },
];

export const bladeDancer: LegendCard = {
  abilities,
  cardNumber: 195,
  cardType: "legend",
  championTag: "Irelia",
  domain: ["calm", "chaos"],
  id: createCardId("sfd-195-221"),
  name: "Blade Dancer",
  rarity: "rare",
  rulesText:
    "When you choose a friendly unit, you may exhaust me and pay [rainbow] to ready it.\nWhen you conquer, you may pay [1] to ready me.",
  setId: "SFD",
};
