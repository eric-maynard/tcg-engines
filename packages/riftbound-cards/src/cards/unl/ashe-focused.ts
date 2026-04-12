import type { Ability } from "@tcg/riftbound-types";
import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Ashe, Focused — unl-169-219
 *
 * "When you play me, choose an opponent. They reveal their hand. Choose a
 * card revealed this way and banish it. When they hold, return it to their
 * hand (even if I'm no longer on the board)."
 *
 * First-phase implementation: `play-self` trigger emits a `reveal-hand`
 * pending choice; the picked card is banished. The "return on hold"
 * persistence is tracked separately and is not covered here.
 */
const abilities: Ability[] = [
  {
    effect: {
      onPicked: "banish",
      target: { type: "player", which: "opponent" },
      type: "reveal-hand",
    },
    trigger: { event: "play-self" },
    type: "triggered",
  },
];

export const asheFocused: UnitCard = {
  abilities,
  cardNumber: 169,
  cardType: "unit",
  domain: "order",
  energyCost: 5,
  id: createCardId("unl-169-219"),
  isChampion: true,
  might: 4,
  name: "Ashe, Focused",
  rarity: "rare",
  rulesText:
    "When you play me, choose an opponent. They reveal their hand. Choose a card revealed this way and banish it. When they hold, return it to their hand (even if I'm no longer on the board).",
  setId: "UNL",
  tags: ["Ashe"],
};
