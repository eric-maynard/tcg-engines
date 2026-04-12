import type { Ability } from "@tcg/riftbound-types";
import type { LegendCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Battle Mistress — sfd-203-221 (Legend, Sivir)
 *
 * When you recycle a rune, you may exhaust me to play a Gold gear token
 * exhausted.
 * When one or more enemy units die, ready me.
 *
 * Two abilities:
 *  1. Triggered (recycle rune): exhaust self, create exhausted Gold token
 *  2. Triggered (enemy dies): ready self
 */
const abilities: Ability[] = [
  {
    condition: {
      cost: { exhaust: true },
      type: "pay-cost",
    },
    effect: {
      ready: false,
      token: { name: "Gold", type: "gear" },
      type: "create-token",
    },
    optional: true,
    trigger: {
      event: "recycle",
      on: { cardType: "card", controller: "friendly", filter: "rune" },
    },
    type: "triggered",
  },
  {
    effect: { target: "self", type: "ready" },
    trigger: { event: "die", on: "enemy-units" },
    type: "triggered",
  },
];

export const battleMistress: LegendCard = {
  abilities,
  cardNumber: 203,
  cardType: "legend",
  championTag: "Sivir",
  domain: ["body", "chaos"],
  id: createCardId("sfd-203-221"),
  name: "Battle Mistress",
  rarity: "rare",
  rulesText:
    "When you recycle a rune, you may exhaust me to play a Gold gear token exhausted.\nWhen one or more enemy units die, ready me.",
  setId: "SFD",
};
