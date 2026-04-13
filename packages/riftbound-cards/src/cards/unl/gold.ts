import type { Ability } from "@tcg/riftbound-types";
import type { GearCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Gold — unl-t05 (gear token)
 *
 * "[Reaction][>] Kill this, [Exhaust]: [Add] [rainbow]."
 */
const abilities: Ability[] = [
  {
    cost: { exhaust: true, kill: "self" },
    effect: {
      power: ["rainbow"],
      type: "add-resource",
    },
    timing: "reaction",
    type: "activated",
  },
];

export const gold: GearCard = {
  abilities,
  cardNumber: 5,
  cardType: "gear",
  id: createCardId("unl-t05"),
  name: "Gold",
  rarity: "common",
  rulesText:
    "[Reaction][&gt;] Kill this, [Exhaust]: [Add] [rainbow]. (Abilities that add resources can't be reacted to.)",
  setId: "UNL",
};
