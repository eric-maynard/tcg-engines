import type { Ability } from "@tcg/riftbound-types";
import type { BattlefieldCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Altar of Blood — unl-206-219
 *
 * "If a unit here would die during combat, its controller may pay
 *  [rainbow][rainbow][rainbow] to heal it, exhaust it, and recall it
 *  instead."
 *
 * Modeled as a replacement on die that, when paid, heals+exhausts+recalls
 * the unit instead.
 */
const abilities: Ability[] = [
  {
    condition: {
      cost: { power: ["rainbow", "rainbow", "rainbow"] },
      type: "pay-cost",
    },
    // "during combat": the dying unit must be an Attacker/Defender (rule 466).
    duringCombat: true,
    duration: "permanent",
    // rule 371.2 — "its controller may pay": the affected unit's controller
    // decides and pays, not the battlefield's controller.
    payer: "affected-controller",
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
    target: { location: "here", type: "unit" },
    type: "replacement",
  } as unknown as Ability,
];

export const altarOfBlood: BattlefieldCard = {
  abilities,
  cardNumber: 206,
  cardType: "battlefield",
  id: createCardId("unl-206-219"),
  name: "Altar of Blood",
  rarity: "uncommon",
  rulesText:
    "If a unit here would die during combat, its controller may pay [rainbow][rainbow][rainbow] to heal it, exhaust it, and recall it instead.",
  setId: "UNL",
};
