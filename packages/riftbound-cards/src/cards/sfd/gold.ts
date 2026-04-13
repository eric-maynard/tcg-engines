import type { Ability } from "@tcg/riftbound-types";
import type { GearCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Gold — sfd-t03 (gear token)
 *
 * "Kill this, [Exhaust]: [Reaction] — [Add] [rainbow]."
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
  cardNumber: 3,
  cardType: "gear",
  id: createCardId("sfd-t03"),
  name: "Gold",
  rarity: "common",
  rulesText:
    "Kill this, [Exhaust]: [Reaction] — [Add] [rainbow]. (Abilities that add resources can't be reacted to.)",
  setId: "SFD",
};
