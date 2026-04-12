import type { Ability } from "@tcg/riftbound-types";
import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Pyke, Dockside Butcher — unl-028-219
 *
 * [Hidden]
 * [Ganking]
 * You may pay [fury] as an additional cost to play me.
 * When you play me, if you paid the additional cost, ready me and give
 * me +2 [Might] this turn.
 */
const abilities: Ability[] = [
  { keyword: "Hidden", type: "keyword" },
  { keyword: "Ganking", type: "keyword" },
  {
    condition: { type: "paid-additional-cost" },
    effect: {
      effects: [
        { target: "self", type: "ready" },
        {
          amount: 2,
          duration: "turn",
          target: "self",
          type: "modify-might",
        },
      ],
      type: "sequence",
    },
    trigger: { event: "play-self" },
    type: "triggered",
  },
];

export const pykeDocksideButcher: UnitCard = {
  abilities,
  cardNumber: 28,
  cardType: "unit",
  domain: "fury",
  energyCost: 3,
  id: createCardId("unl-028-219"),
  isChampion: true,
  might: 2,
  name: "Pyke, Dockside Butcher",
  rarity: "epic",
  rulesText:
    "[Hidden] (Hide now for [rainbow] to react with later for [energy_0].)\n[Ganking] (I can move from battlefield to battlefield.)\nYou may pay [fury] as an additional cost to play me.\nWhen you play me, if you paid the additional cost, ready me and give me +2 [Might] this turn.",
  setId: "UNL",
  tags: ["Pyke"],
};
