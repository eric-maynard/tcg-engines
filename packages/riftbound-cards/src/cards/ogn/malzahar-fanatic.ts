import type { Ability } from "@tcg/riftbound-types";
import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Malzahar, Fanatic — ogn-113-298
 *
 * Kill a friendly unit or gear, [Exhaust]: [Action] — [Add] [rainbow][rainbow].
 *
 * Activated ability:
 * - Cost: kill a friendly unit or gear AND exhaust self
 * - Timing: action (usable on your turn or in showdowns)
 * - Effect: add two rainbow power to the rune pool
 */
const abilities: Ability[] = [
  {
    cost: {
      exhaust: true,
      kill: {
        controller: "friendly",
        type: "permanent",
      },
    },
    effect: { power: ["rainbow", "rainbow"], type: "add-resource" },
    timing: "action",
    type: "activated",
  },
];

export const malzaharFanatic: UnitCard = {
  abilities,
  cardNumber: 113,
  cardType: "unit",
  domain: "mind",
  energyCost: 4,
  id: createCardId("ogn-113-298"),
  isChampion: true,
  might: 3,
  name: "Malzahar, Fanatic",
  rarity: "rare",
  rulesText:
    "Kill a friendly unit or gear, [Exhaust]: [Action] — [Add] [rainbow][rainbow]. (Use on your turn or in showdowns. Abilities that add resources can't be reacted to.)",
  setId: "OGN",
  tags: ["Malzahar"],
};
