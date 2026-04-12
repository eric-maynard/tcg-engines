import type { Ability } from "@tcg/riftbound-types";
import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Rell, Magnetic — sfd-024-221
 *
 * "[Tank]
 * When I attack, you may play an Equipment with Energy cost no more than [2],
 *  ignoring its cost. If you do, then do this: Attach it to me."
 *
 * Modeled as:
 *   1. Tank keyword.
 *   2. Triggered ability on attack: play an Equipment (energy cost <= 2)
 *      ignoring energy cost, then attach it to self. Uses pendingValue so the
 *      attach step references the just-played equipment.
 */
const abilities: Ability[] = [
  { keyword: "Tank", type: "keyword" },
  {
    effect: {
      effects: [
        {
          from: "hand",
          ignoreCost: "energy",
          target: { filter: { energyCost: { lte: 2 } }, type: "equipment" },
          type: "play",
        },
        {
          equipment: { type: "pending-value" },
          to: "self",
          type: "attach",
        },
      ],
      pendingValue: { source: 0 },
      type: "sequence",
    },
    optional: true,
    trigger: { event: "attack", on: "self" },
    type: "triggered",
  },
];

export const rellMagnetic: UnitCard = {
  abilities,
  cardNumber: 24,
  cardType: "unit",
  domain: "fury",
  energyCost: 4,
  id: createCardId("sfd-024-221"),
  isChampion: true,
  might: 4,
  name: "Rell, Magnetic",
  rarity: "rare",
  rulesText:
    "[Tank] (I must be assigned combat damage first.)\nWhen I attack, you may play an Equipment with Energy cost no more than [2], ignoring its cost. If you do, then do this: Attach it to me.",
  setId: "SFD",
  tags: ["Rell"],
};
