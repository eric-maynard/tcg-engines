import type { Ability } from "@tcg/riftbound-types";
import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

// rule 430.1 — the parser has no "N+ runes" pattern; spelled out here so the
// +4 stays conditional on YOUR rune pool.
const abilities: Ability[] = [
  {
    condition: { amount: 8, type: "runes-at-least" },
    effect: { amount: 4, target: "self", type: "modify-might" },
    type: "static",
  },
];

export const yiMeditative: UnitCard = {
  abilities,
  cardNumber: 4,
  cardType: "unit",
  domain: "calm",
  energyCost: 5,
  id: createCardId("ogs-004-024"),
  isChampion: true,
  might: 4,
  name: "Yi, Meditative",
  rarity: "rare",
  rulesText: "While you have 8+ runes, I have +4 [Might].",
  setId: "OGS",
  tags: ["Yi"],
};
