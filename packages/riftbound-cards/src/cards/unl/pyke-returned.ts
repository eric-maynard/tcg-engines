import type { Ability } from "@tcg/riftbound-types";
import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Pyke, Returned — unl-145-219
 *
 * [Hidden]
 * [Backline]
 * Once each turn, when an enemy unit dies while I'm at a battlefield,
 * play a Gold gear token exhausted.
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
    condition: { type: "while-at-battlefield" },
    effect: {
      location: "base",
      token: {
        name: "Gold",
        type: "gear",
      },
      type: "create-token",
    },
    trigger: {
      event: "die",
      on: "enemy-units",
      restrictions: [{ type: "once-per-turn" }],
    },
    type: "triggered",
  },
];

export const pykeReturned: UnitCard = {
  abilities,
  cardNumber: 145,
  cardType: "unit",
  domain: "chaos",
  energyCost: 3,
  id: createCardId("unl-145-219"),
  isChampion: true,
  might: 3,
  name: "Pyke, Returned",
  rarity: "rare",
  rulesText:
    "[Hidden] (Hide now for [rainbow] to react with later for [energy_0].)\n[Backline] (I must be assigned combat damage last.)\nOnce each turn, when an enemy unit dies while I'm at a battlefield, play a Gold gear token exhausted. (It has &quot;[Reaction][&gt;] Kill this, [Exhaust]: [Add] [rainbow].&quot;)",
  setId: "UNL",
  tags: ["Pyke"],
};
