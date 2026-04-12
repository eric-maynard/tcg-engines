import type { Ability } from "@tcg/riftbound-types";
import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Evelynn, Entrancing — unl-141-219
 *
 * [Hidden]
 * [Backline]
 * When you play me from face down on your turn, you may move an enemy
 * unit at a different location to my battlefield.
 */
const abilities: Ability[] = [
  { keyword: "Hidden", type: "keyword" },
  {
    effect: {
      keyword: "Backline",
      target: "self",
      type: "grant-keyword",
    },
    type: "static",
  },
  {
    effect: {
      target: { controller: "enemy", type: "unit" },
      to: "here",
      type: "move",
    },
    optional: true,
    trigger: {
      event: "play-from-hidden",
      on: "self",
      restrictions: [{ type: "during-turn", whose: "your" }],
    },
    type: "triggered",
  },
];

export const evelynnEntrancing: UnitCard = {
  abilities,
  cardNumber: 141,
  cardType: "unit",
  domain: "chaos",
  energyCost: 2,
  id: createCardId("unl-141-219"),
  isChampion: true,
  might: 2,
  name: "Evelynn, Entrancing",
  rarity: "rare",
  rulesText:
    "[Hidden] (Hide now for [rainbow] to react with later for [energy_0].)\n[Backline] (I must be assigned combat damage last.)\nWhen you play me from face down on your turn, you may move an enemy unit at a different location to my battlefield.",
  setId: "UNL",
  tags: ["Evelynn"],
};
