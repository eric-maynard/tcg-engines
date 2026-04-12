import type { Ability } from "@tcg/riftbound-types";
import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Fiora, Worthy — sfd-180-221
 *
 * When a unit you control becomes [Mighty], you may pay [order] to
 * ready it.
 */
const abilities: Ability[] = [
  {
    condition: {
      cost: { power: ["order"] },
      type: "pay-cost",
    },
    effect: { target: { type: "trigger-source" }, type: "ready" },
    optional: true,
    trigger: {
      event: "become-mighty",
      on: "friendly-units",
    },
    type: "triggered",
  },
];

export const fioraWorthy: UnitCard = {
  abilities,
  cardNumber: 180,
  cardType: "unit",
  domain: "order",
  energyCost: 3,
  id: createCardId("sfd-180-221"),
  isChampion: true,
  might: 3,
  name: "Fiora, Worthy",
  rarity: "epic",
  rulesText:
    "When a unit you control becomes [Mighty], you may pay [order] to ready it. (A unit is Mighty while it has 5+ [Might].)",
  setId: "SFD",
  tags: ["Fiora"],
};
