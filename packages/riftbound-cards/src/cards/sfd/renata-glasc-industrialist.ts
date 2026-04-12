import type { Ability } from "@tcg/riftbound-types";
import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Renata Glasc, Industrialist — sfd-171-221
 *
 * Your tokens enter ready.
 */
const abilities: Ability[] = [
  {
    effect: {
      keyword: "EntersReady",
      target: {
        controller: "friendly",
        filter: "token",
        type: "unit",
      },
      type: "grant-keyword",
    },
    type: "static",
  },
];

export const renataGlascIndustrialist: UnitCard = {
  abilities,
  cardNumber: 171,
  cardType: "unit",
  domain: "order",
  energyCost: 4,
  id: createCardId("sfd-171-221"),
  isChampion: true,
  might: 4,
  name: "Renata Glasc, Industrialist",
  rarity: "rare",
  rulesText: "Your tokens enter ready.",
  setId: "SFD",
  tags: ["Renata Glasc"],
};
