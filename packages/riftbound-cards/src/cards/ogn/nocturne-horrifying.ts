import type { Ability } from "@tcg/riftbound-types";
import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Nocturne, Horrifying — ogn-194-298
 *
 * "[Ganking]
 *  As you look at or reveal me from the top of your deck, you may banish
 *  me. If you do, you may play me for [rainbow]."
 */
const abilities: Ability[] = [
  { keyword: "Ganking", type: "keyword" },
  {
    effect: {
      effects: [
        { target: "self", type: "banish" },
        // rule 356.1.a — "for [rainbow]" is an ALTERNATIVE cost: it replaces
        // the printed 4 Energy + [chaos] entirely, and the play is optional.
        {
          cost: { power: ["rainbow"] },
          optional: true,
          target: "self",
          type: "play",
        },
      ],
      type: "sequence",
    },
    optional: true,
    trigger: { event: "reveal", on: "self" },
    type: "triggered",
  },
];

export const nocturneHorrifying: UnitCard = {
  abilities,
  cardNumber: 194,
  cardType: "unit",
  domain: "chaos",
  energyCost: 4,
  id: createCardId("ogn-194-298"),
  isChampion: true,
  might: 4,
  name: "Nocturne, Horrifying",
  rarity: "rare",
  rulesText:
    "[Ganking] (I can move from battlefield to battlefield.)\nAs you look at or reveal me from the top of your deck, you may banish me. If you do, you may play me for [rainbow].",
  setId: "OGN",
  tags: ["Nocturne"],
};
