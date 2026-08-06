import type { Ability } from "@tcg/riftbound-types";
import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * rule 465.2.c.10 — "If I have moved twice this turn, I don't take damage":
 * a continuous restriction, so it must survive as a typed condition the engine
 * can re-evaluate (the parser only produces a `custom` text condition here).
 */
const abilities: Ability[] = [
  { keyword: "Ganking", type: "keyword" },
  {
    condition: { count: 2, type: "moved-this-turn" },
    effect: { restriction: "no-damage", type: "restriction" },
    type: "static",
  } as unknown as Ability,
];

export const kaynUnleashed: UnitCard = {
  abilities,
  cardNumber: 189,
  cardType: "unit",
  domain: "chaos",
  energyCost: 6,
  id: createCardId("ogn-189-298"),
  isChampion: true,
  might: 6,
  name: "Kayn, Unleashed",
  rarity: "rare",
  rulesText:
    "[Ganking] (I can move from battlefield to battlefield.)\nIf I have moved twice this turn, I don't take damage.",
  setId: "OGN",
  tags: ["Kayn"],
};
