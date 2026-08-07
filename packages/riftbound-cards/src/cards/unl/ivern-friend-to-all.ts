import type { Ability } from "@tcg/riftbound-types";
import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Ivern, Friend to All — unl-177-219
 *
 * "As you play me, choose Bird, Cat, Dog, or Poro. I gain that tag.
 *  When I conquer or hold, score 1 point if your units have all of the
 *  following tags among them — Bird, Cat, Dog, and Poro."
 */
const tagsCheck = {
  conditions: [
    {
      count: 1,
      target: {
        controller: "friendly",
        filter: { tag: "Bird" },
        type: "unit",
      },
      type: "has-at-least",
    },
    {
      count: 1,
      target: {
        controller: "friendly",
        filter: { tag: "Cat" },
        type: "unit",
      },
      type: "has-at-least",
    },
    {
      count: 1,
      target: {
        controller: "friendly",
        filter: { tag: "Dog" },
        type: "unit",
      },
      type: "has-at-least",
    },
    {
      count: 1,
      target: {
        controller: "friendly",
        filter: { tag: "Poro" },
        type: "unit",
      },
      type: "has-at-least",
    },
  ],
  type: "and",
} as const;

const abilities: Ability[] = [
  {
    // rule 135.2.b.3 / 762 — "As you play me, choose Bird, Cat, Dog, or Poro.
    // I gain that tag." The choice is restricted to those four tags and is
    // recorded on Ivern himself as he is played.
    effect: {
      asYouPlay: true,
      cardType: "tag",
      gainsNamedTag: true,
      options: ["Bird", "Cat", "Dog", "Poro"],
      type: "name-card",
    },
    trigger: { event: "play-self", on: "self" },
    type: "triggered",
  },
  {
    condition: tagsCheck,
    effect: { amount: 1, type: "score" },
    trigger: { event: "conquer", on: "self" },
    type: "triggered",
  },
  {
    condition: tagsCheck,
    effect: { amount: 1, type: "score" },
    trigger: { event: "hold", on: "self" },
    type: "triggered",
  },
];

export const ivernFriendToAll: UnitCard = {
  abilities,
  cardNumber: 177,
  cardType: "unit",
  domain: "order",
  energyCost: 6,
  id: createCardId("unl-177-219"),
  isChampion: true,
  might: 6,
  name: "Ivern, Friend to All",
  rarity: "epic",
  rulesText:
    "As you play me, choose Bird, Cat, Dog, or Poro. I gain that tag.\nWhen I conquer or hold, score 1 point if your units have all of the following tags among them — Bird, Cat, Dog, and Poro.",
  setId: "UNL",
  tags: ["Ivern"],
};
