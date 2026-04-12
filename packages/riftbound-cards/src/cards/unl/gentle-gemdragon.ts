import type { Ability } from "@tcg/riftbound-types";
import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Gentle Gemdragon — unl-104-219
 *
 * When you play me or another Dragon, ready up to 2 runes.
 */
const readyRunesEffect = {
  target: { controller: "friendly" as const, quantity: { upTo: 2 }, type: "rune" as const },
  type: "ready" as const,
};

const abilities: Ability[] = [
  {
    effect: readyRunesEffect,
    trigger: { event: "play-self" },
    type: "triggered",
  },
  {
    effect: readyRunesEffect,
    trigger: {
      event: "play-unit",
      on: {
        cardType: "unit",
        controller: "friendly",
        excludeSelf: true,
        tag: "Dragon",
      },
    },
    type: "triggered",
  },
];

export const gentleGemdragon: UnitCard = {
  abilities,
  cardNumber: 104,
  cardType: "unit",
  domain: "body",
  energyCost: 8,
  id: createCardId("unl-104-219"),
  might: 8,
  name: "Gentle Gemdragon",
  rarity: "uncommon",
  rulesText: "When you play me or another Dragon, ready up to 2 runes.",
  setId: "UNL",
};
