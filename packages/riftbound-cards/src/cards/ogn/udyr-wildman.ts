import type { Ability } from "@tcg/riftbound-types";
import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Udyr, Wildman — ogn-157-298
 *
 * "Spend my buff: Choose one you've not chosen this turn —
 *   Deal 2 to a unit at a battlefield.
 *   Stun a unit at a battlefield.
 *   Ready me.
 *   Give me [Ganking] this turn."
 */
const abilities: Ability[] = [
  {
    cost: { spend: "buff" },
    effect: {
      notChosenThisTurn: true,
      options: [
        {
          effect: {
            amount: 2,
            target: { location: "battlefield", type: "unit" },
            type: "damage",
          },
          label: "Deal 2",
        },
        {
          effect: {
            target: { location: "battlefield", type: "unit" },
            type: "stun",
          },
          label: "Stun",
        },
        {
          effect: { target: "self", type: "ready" },
          label: "Ready me",
        },
        {
          effect: {
            duration: "turn",
            keyword: "Ganking",
            target: "self",
            type: "grant-keyword",
          },
          label: "Ganking",
        },
      ],
      type: "choice",
    },
    type: "activated",
  },
];

export const udyrWildman: UnitCard = {
  abilities,
  cardNumber: 157,
  cardType: "unit",
  domain: "body",
  energyCost: 6,
  id: createCardId("ogn-157-298"),
  isChampion: true,
  might: 6,
  name: "Udyr, Wildman",
  rarity: "rare",
  rulesText:
    "Spend my buff: Choose one you've not chosen this turn —Deal 2 to a unit at a battlefield.Stun a unit at a battlefield.Ready me.Give me [Ganking] this turn.",
  setId: "OGN",
  tags: ["Udyr"],
};
