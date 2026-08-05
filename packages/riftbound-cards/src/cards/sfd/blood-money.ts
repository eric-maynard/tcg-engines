import type { Ability } from "@tcg/riftbound-types";
import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Blood Money — sfd-162-221
 *
 * Kill a unit at a battlefield with 2 [Might] or less. If it was an enemy unit,
 * play a Gold gear token exhausted. If it was a friendly unit, play two Gold
 * gear tokens exhausted.
 */
const abilities: Ability[] = [
  {
    effect: {
      effects: [
        { target: { location: "battlefield", type: "unit" }, type: "kill" },
        {
          condition: { controller: "friendly", type: "target-controller" },
          else: {
            ready: false,
            token: { name: "Gold", type: "gear" },
            type: "create-token",
          },
          then: {
            amount: 2,
            ready: false,
            token: { name: "Gold", type: "gear" },
            type: "create-token",
          },
          type: "conditional",
        },
      ],
      target: { filter: { might: { lte: 2 } }, location: "battlefield", type: "unit" },
      type: "sequence",
    },
    timing: "action",
    type: "spell",
  },
] as unknown as Ability[];

export const bloodMoney: SpellCard = {
  abilities,
  cardNumber: 162,
  cardType: "spell",
  domain: "order",
  energyCost: 2,
  id: createCardId("sfd-162-221"),
  name: "Blood Money",
  rarity: "uncommon",
  rulesText:
    "[Action] (Play on your turn or in showdowns.)\nKill a unit at a battlefield with 2 [Might] or less. If it was an enemy unit, play a Gold gear token exhausted. If it was a friendly unit, play two Gold gear tokens exhausted.",
  setId: "SFD",
  timing: "action",
};
