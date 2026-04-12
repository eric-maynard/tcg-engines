import type { Ability } from "@tcg/riftbound-types";
import type { BattlefieldCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Vaults of Helia — unl-219-219 (Battlefield)
 *
 * When you hold here, your non-token units cost [1] more to play this turn.
 *
 * Captured as a triggered grant-keyword with a virtual "CostIncrease"
 * modifier. Engine support is pending.
 */
const abilities: Ability[] = [
  {
    effect: {
      duration: "turn",
      keyword: "CostIncrease",
      target: "controller",
      type: "grant-keyword",
      value: 1,
    },
    trigger: {
      event: "hold",
      on: { controller: "friendly", location: "here" },
    },
    type: "triggered",
  },
];

export const vaultsOfHelia: BattlefieldCard = {
  abilities,
  cardNumber: 219,
  cardType: "battlefield",
  id: createCardId("unl-219-219"),
  name: "Vaults of Helia",
  rarity: "uncommon",
  rulesText: "When you hold here, your non-token units cost [1] more to play this turn.",
  setId: "UNL",
};
