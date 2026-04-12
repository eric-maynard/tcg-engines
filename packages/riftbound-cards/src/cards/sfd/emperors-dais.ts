import type { Ability } from "@tcg/riftbound-types";
import type { BattlefieldCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Emperor's Dais — sfd-207-221 (Battlefield)
 *
 * When you conquer here, you may pay [1] and return a unit you control
 * here to its owner's hand. If you do, play a 2 [Might] Sand Soldier unit
 * token here.
 *
 * Trigger: conquer at this battlefield
 * Cost: 1 energy + return a friendly unit here to its owner's hand
 * Effect: create a Sand Soldier token here
 */
const abilities: Ability[] = [
  {
    condition: {
      cost: {
        energy: 1,
        returnToHand: {
          controller: "friendly",
          location: "here",
          type: "unit",
        },
      },
      type: "pay-cost",
    },
    effect: {
      location: "here",
      token: { might: 2, name: "Sand Soldier", type: "unit" },
      type: "create-token",
    },
    optional: true,
    trigger: { event: "conquer", on: "controller" },
    type: "triggered",
  },
];

export const emperorsDais: BattlefieldCard = {
  abilities,
  cardNumber: 207,
  cardType: "battlefield",
  id: createCardId("sfd-207-221"),
  name: "Emperor's Dais",
  rarity: "uncommon",
  rulesText:
    "When you conquer here, you may pay [1] and return a unit you control here to its owner's hand. If you do, play a 2 [Might] Sand Soldier unit token here.",
  setId: "SFD",
};
