import type { Ability } from "@tcg/riftbound-types";
import type { BattlefieldCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Gardens of Becoming — unl-213-219 (Battlefield)
 *
 * 'Units here have "[Exhaust]: Gain 1 XP."'
 *
 * rule 364 / 135.4.b — an unconditional static grant: every unit here (either
 * player's) HAS the activated ability below, and loses it the moment it leaves.
 * `abilities[1]` is that granted text; it is `granted-only`, so the battlefield
 * itself never activates it. rule 730.1: the activating unit's CONTROLLER gains
 * the XP.
 */
const abilities: Ability[] = [
  {
    effect: {
      abilityIndex: 1,
      duration: "static",
      target: { location: "here", type: "unit" },
      type: "grant-ability",
    },
    type: "static",
  },
  {
    cost: { exhaust: true },
    effect: { amount: 1, type: "gain-xp" },
    restrictions: [{ type: "granted-only" }],
    type: "activated",
  },
];

export const gardensOfBecoming: BattlefieldCard = {
  abilities,
  cardNumber: 213,
  cardType: "battlefield",
  id: createCardId("unl-213-219"),
  name: "Gardens of Becoming",
  rarity: "uncommon",
  rulesText: "Units here have \"[Exhaust]: Gain 1 XP.\"",
  setId: "UNL",
};
