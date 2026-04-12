import type { Ability } from "@tcg/riftbound-types";
import type { GearCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Ancient Henge — sfd-117-221
 *
 * "[Exhaust]: [Reaction] — Pay any amount of Energy to [Add] that much
 *  [rainbow]."
 */
const abilities: Ability[] = [
  {
    cost: { exhaust: true, x: { resource: "rainbow-energy" } },
    effect: {
      power: ["rainbow"],
      type: "add-resource",
    },
    timing: "reaction",
    type: "activated",
  },
];

export const ancientHenge: GearCard = {
  abilities,
  cardNumber: 117,
  cardType: "gear",
  domain: "body",
  energyCost: 2,
  id: createCardId("sfd-117-221"),
  name: "Ancient Henge",
  rarity: "epic",
  rulesText:
    "[Exhaust]: [Reaction] — Pay any amount of Energy to [Add] that much [rainbow]. (Abilities that add resources can't be reacted to.)",
  setId: "SFD",
};
