import type { Ability } from "@tcg/riftbound-types";
import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

// rule 364.3.a: one conditional passive grants BOTH halves — the parser drops
// the "+2 [Might] and" clause and the "[rainbow][rainbow]" amount, and the
// phrasing is unique to this card.
const abilities: Ability[] = [
  { cost: { energy: 1, power: ["chaos"] }, keyword: "Accelerate", type: "keyword" },
  {
    condition: { amount: 2, type: "spent-power" },
    effect: {
      effects: [
        { amount: 2, target: { type: "self" }, type: "modify-might" },
        { keyword: "Ganking", target: { type: "self" }, type: "grant-keyword" },
      ],
      type: "sequence",
    },
    type: "static",
  },
] as unknown as Ability[];

export const sivirMercenary: UnitCard = {
  abilities,
  cardNumber: 143,
  cardType: "unit",
  domain: "chaos",
  energyCost: 4,
  id: createCardId("sfd-143-221"),
  isChampion: true,
  might: 4,
  name: "Sivir, Mercenary",
  rarity: "rare",
  rulesText:
    "[Accelerate] (You may pay [1][chaos] as an additional cost to have me enter ready.)\nIf you've spent at least [rainbow][rainbow] this turn, I have +2 [Might] and [Ganking]. (I can move from battlefield to battlefield.)",
  setId: "SFD",
  tags: ["Sivir"],
};
