import type { Ability } from "@tcg/riftbound-types";
import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

// rule 355.10 — "give ONE of your other units here …" names a single chosen
// recipient shared by both halves of the grant, so the target descriptor keeps
// the default quantity of 1 (a bare plural would parse as quantity:"all").
const abilities: Ability[] = [
  {
    type: "triggered",
    trigger: { event: "attack-or-defend", on: "self" },
    effect: {
      type: "sequence",
      effects: [
        {
          type: "modify-might",
          amount: 3,
          duration: "turn",
          target: { type: "unit", controller: "friendly", excludeSelf: true, location: "here" },
        },
        {
          type: "grant-keyword",
          keyword: "Tank",
          duration: "turn",
          target: { type: "unit", controller: "friendly", excludeSelf: true, location: "here" },
        },
      ],
    },
  } as Ability,
];

export const yuumiMagicalCat: UnitCard = {
  abilities,
  cardNumber: 56,
  cardType: "unit",
  domain: "calm",
  energyCost: 3,
  id: createCardId("unl-056-219"),
  isChampion: true,
  might: 1,
  name: "Yuumi, Magical Cat",
  rarity: "rare",
  rulesText:
    "When I attack or defend, give one of your other units here +3 [Might] and [Tank] this turn. (It must be assigned combat damage first.)",
  setId: "UNL",
  tags: ["Yuumi"],
};
