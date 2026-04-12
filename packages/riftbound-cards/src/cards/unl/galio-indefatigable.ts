import type { Ability } from "@tcg/riftbound-types";
import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Galio, Indefatigable — unl-171-219
 *
 * [Deflect]
 * [Tank]
 * I don't deal combat damage.
 */
const abilities: Ability[] = [
  { keyword: "Deflect", type: "keyword", value: 1 },
  { keyword: "Tank", type: "keyword" },
  {
    effect: {
      keyword: "NoCombatDamage",
      target: "self",
      type: "grant-keyword",
    },
    type: "static",
  },
];

export const galioIndefatigable: UnitCard = {
  abilities,
  cardNumber: 171,
  cardType: "unit",
  domain: "order",
  energyCost: 3,
  id: createCardId("unl-171-219"),
  isChampion: true,
  might: 6,
  name: "Galio, Indefatigable",
  rarity: "rare",
  rulesText:
    "[Deflect] (Opponents must pay [rainbow] to choose me with a spell or ability.)\n[Tank] (I must be assigned combat damage first.)\nI don't deal combat damage.",
  setId: "UNL",
  tags: ["Galio"],
};
