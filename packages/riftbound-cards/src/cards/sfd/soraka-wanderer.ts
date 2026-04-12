import type { Ability } from "@tcg/riftbound-types";
import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Soraka, Wanderer — sfd-173-221
 *
 * "I must be assigned combat damage last. (Backline)
 *  If another unit you control here would die, if it has less Might than me,
 *  instead heal it, exhaust it, and recall it."
 *
 * Modeled as:
 *   - Backline keyword.
 *   - Replacement ability: on die, instead heal+exhaust+recall.
 */
const abilities: Ability[] = [
  { keyword: "Backline", type: "keyword" },
  {
    replacement: {
      effects: [
        {
          amount: "all",
          target: { type: "trigger-source" },
          type: "heal",
        },
        {
          target: { type: "trigger-source" },
          type: "exhaust",
        },
        {
          target: { type: "trigger-source" },
          type: "recall",
        },
      ],
      type: "sequence",
    },
    replaces: "die",
    target: {
      controller: "friendly",
      excludeSelf: true,
      location: "here",
      type: "unit",
    },
    type: "replacement",
  },
];

export const sorakaWanderer: UnitCard = {
  abilities,
  cardNumber: 173,
  cardType: "unit",
  domain: "order",
  energyCost: 4,
  id: createCardId("sfd-173-221"),
  isChampion: true,
  might: 4,
  name: "Soraka, Wanderer",
  rarity: "rare",
  rulesText:
    "I must be assigned combat damage last.\nIf another unit you control here would die, if it has less Might than me, instead heal it, exhaust it, and recall it. (Send it to base. This isn't a move.)",
  setId: "SFD",
  tags: ["Soraka"],
};
