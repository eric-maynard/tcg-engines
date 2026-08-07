import type { Ability } from "@tcg/riftbound-types";
import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Arise! — sfd-198-221
 *
 * "Play a 2 [Might] Sand Soldier unit token for each Equipment you control.
 *  Then do this: Ready up to two of them."
 *
 * Modeled as a sequence: for-each friendly equipment create one Sand Soldier
 * token, then ready up to 2 Sand Soldiers.
 */
const abilities: Ability[] = [
  {
    effect: {
      effects: [
        {
          effect: {
            token: { might: 2, name: "Sand Soldier", type: "unit" },
            type: "create-token",
          },
          target: { controller: "friendly", type: "equipment" },
          type: "for-each",
        },
        {
          // rule 359.3.e.14 — "them" is linked to the tokens THIS spell
          // played, so the ready step reads the sequence's pending value
          // instead of scanning the board for Sand Soldiers.
          target: {
            quantity: { upTo: 2 },
            type: "pending-value",
          },
          type: "ready",
        },
      ],
      pendingValue: { source: 0 },
      type: "sequence",
    },
    timing: "action",
    type: "spell",
  },
];

export const arise: SpellCard = {
  abilities,
  cardNumber: 198,
  cardType: "spell",
  domain: ["calm", "order"],
  energyCost: 6,
  id: createCardId("sfd-198-221"),
  name: "Arise!",
  rarity: "epic",
  rulesText:
    "Play a 2 [Might] Sand Soldier unit token for each Equipment you control. Then do this: Ready up to two of them.",
  setId: "SFD",
  timing: "action",
};
