import type { Ability } from "@tcg/riftbound-types";
import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Undying Loyalty — unl-168-219
 *
 * "This costs [2] less if you choose a Bird, Cat, Dog, or Poro.
 *  Play a unit with cost no more than [2] and no more than [rainbow] from
 *  your trash, ignoring its cost."
 *
 * Modeled as a spell whose effect plays a low-cost unit from the trash.
 */
const abilities: Ability[] = [
  {
    effect: {
      from: "trash",
      ignoreCost: true,
      target: {
        controller: "friendly",
        filter: [{ energyCost: { lte: 2 } }],
        type: "unit",
      },
      type: "play",
    },
    timing: "action",
    type: "spell",
  },
];

export const undyingLoyalty: SpellCard = {
  abilities,
  cardNumber: 168,
  cardType: "spell",
  domain: "order",
  energyCost: 2,
  id: createCardId("unl-168-219"),
  name: "Undying Loyalty",
  rarity: "uncommon",
  rulesText:
    "This costs [2] less if you choose a Bird, Cat, Dog, or Poro.\nPlay a unit with cost no more than [2] and no more than [rainbow] from your trash, ignoring its cost.",
  setId: "UNL",
  timing: "action",
};
