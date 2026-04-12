import type { Ability } from "@tcg/riftbound-types";
import type { GearCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Hextech Anomaly — sfd-083-221
 *
 * "[Exhaust]: [Reaction] — Pay any amount of [rainbow] to [Add] that much
 *  Energy."
 */
const abilities: Ability[] = [
  {
    cost: { exhaust: true, x: { resource: "rainbow-energy" } },
    effect: {
      energy: { variable: "x" } as unknown as number,
      type: "add-resource",
    },
    timing: "reaction",
    type: "activated",
  },
];

export const hextechAnomaly: GearCard = {
  abilities,
  cardNumber: 83,
  cardType: "gear",
  domain: "mind",
  energyCost: 3,
  id: createCardId("sfd-083-221"),
  name: "Hextech Anomaly",
  rarity: "rare",
  rulesText:
    "[Exhaust]: [Reaction] — Pay any amount of [rainbow] to [Add] that much Energy. (Abilities that add resources can't be reacted to.)",
  setId: "SFD",
};
