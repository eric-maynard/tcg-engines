import type { Ability } from "@tcg/riftbound-types";
import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Irelia, Graceful — sfd-141-221
 *
 * Your spells that choose me cost [1] or [rainbow] less.
 *
 * Captured as a virtual "ChooseSelfCostReduction" keyword on self. Engine
 * support for this conditional cost reduction is still pending.
 */
const abilities: Ability[] = [
  {
    effect: {
      keyword: "ChooseSelfCostReduction",
      target: "self",
      type: "grant-keyword",
      value: 1,
    },
    type: "static",
  },
];

export const ireliaGraceful: UnitCard = {
  abilities,
  cardNumber: 141,
  cardType: "unit",
  domain: "chaos",
  energyCost: 4,
  id: createCardId("sfd-141-221"),
  isChampion: true,
  might: 4,
  name: "Irelia, Graceful",
  rarity: "rare",
  rulesText: "Your spells that choose me cost [1] or [rainbow] less.",
  setId: "SFD",
  tags: ["Irelia"],
};
