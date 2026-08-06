import type { Ability } from "@tcg/riftbound-types";
import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Rek'Sai, Swarm Queen — sfd-170-221
 *
 * "When I attack, you may reveal the top 2 cards of your Main Deck. You may
 *  banish one, then play it. If it is a unit, you may play it here. Recycle
 *  the rest."
 *
 * rule-id: sfd-170-221-reveal-pick-from-top — the pick must come from the two
 * revealed top-of-deck cards, never an arbitrary board card. Modeled with the
 * `look … onPicked:"play"` shape (same as ogn-062-298 Reinforce): the top 2
 * are surfaced as a reveal-and-pick, the optional pick is banished then added
 * to the chain as a play (owner chooses the location, which covers "here"),
 * and the rest are recycled.
 */
const abilities: Ability[] = [
  {
    effect: {
      amount: 2,
      from: "deck",
      onPicked: "play",
      optional: true,
      type: "look",
    },
    optional: true,
    trigger: { event: "attack", on: "self" },
    type: "triggered",
  },
];

export const reksaiSwarmQueen: UnitCard = {
  abilities,
  cardNumber: 170,
  cardType: "unit",
  domain: "order",
  energyCost: 5,
  id: createCardId("sfd-170-221"),
  isChampion: true,
  might: 5,
  name: "Rek'Sai, Swarm Queen",
  rarity: "rare",
  rulesText:
    "When I attack, you may reveal the top 2 cards of your Main Deck. You may banish one, then play it. If it is a unit, you may play it here. Recycle the rest.",
  setId: "SFD",
  tags: ["Rek'Sai"],
};
