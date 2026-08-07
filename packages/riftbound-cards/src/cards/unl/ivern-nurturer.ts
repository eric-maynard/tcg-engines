import type { Ability } from "@tcg/riftbound-types";
import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

// rule 355.10 — "Then if you revealed a Bird, Cat, Dog, or Poro, do this:
// [Buff] a friendly unit" is a linked follow-up to the look/reveal, gated on
// the TAGS of the card actually revealed; declining the look reveals nothing.
const abilities: Ability[] = [
  {
    effect: {
      amount: 3,
      filter: { cardTypes: ["unit"] },
      followUp: {
        condition: { tags: ["Bird", "Cat", "Dog", "Poro"], type: "trigger-source-tag" },
        then: {
          chooseTarget: true,
          target: { controller: "friendly", type: "unit" },
          type: "buff",
        },
        type: "conditional",
      },
      from: "deck",
      optional: true,
      type: "look",
    },
    trigger: { event: "play-self-or-hold", on: "self" },
    type: "triggered",
  } as unknown as Ability,
];

export const ivernNurturer: UnitCard = {
  abilities,
  cardNumber: 51,
  cardType: "unit",
  domain: "calm",
  energyCost: 5,
  id: createCardId("unl-051-219"),
  isChampion: true,
  might: 4,
  name: "Ivern, Nurturer",
  rarity: "rare",
  rulesText:
    "When you play me or when I hold, look at the top 3 cards of your Main Deck. You may reveal a unit from among them and draw it. Recycle the rest. Then if you revealed a Bird, Cat, Dog, or Poro, do this: [Buff] a friendly unit. (Give it a +1 [Might] buff if it doesn't have one.)",
  setId: "UNL",
  tags: ["Ivern"],
};
