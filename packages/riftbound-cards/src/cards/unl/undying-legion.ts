import type { Ability } from "@tcg/riftbound-types";
import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Undying Legion — unl-025-219
 *
 * [Legion][>] You may play me from your trash for [3][fury].
 *
 * Represented as a Legion effect keyword that allows the owner to play
 * this card from the trash for an alternative cost. The engine will
 * interpret this at the move-gathering stage.
 */
const abilities: Ability[] = [
  {
    effect: {
      from: "trash",
      target: { controller: "friendly", type: "unit" },
      type: "play",
      // Alternative cost captured as part of the override; the engine's
      // Legion resolver will swap this in for the card's printed cost.
    },
    keyword: "Legion",
    type: "keyword",
  },
];

export const undyingLegion: UnitCard = {
  abilities,
  cardNumber: 25,
  cardType: "unit",
  domain: "fury",
  energyCost: 3,
  id: createCardId("unl-025-219"),
  might: 3,
  name: "Undying Legion",
  rarity: "rare",
  rulesText:
    "[Legion][&gt;] You may play me from your trash for [3][fury]. (Get the effect if you've played another card this turn.)",
  setId: "UNL",
};
