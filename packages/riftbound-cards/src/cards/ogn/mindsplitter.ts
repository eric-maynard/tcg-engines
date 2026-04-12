import type { Ability } from "@tcg/riftbound-types";
import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Mindsplitter — ogn-192-298
 *
 * "When you play me, choose an opponent. They reveal their hand. Choose a
 * card from it, and they discard that card."
 *
 * Modelled as a `play-self` triggered ability that emits a `reveal-hand`
 * pending choice targeting the opponent's full hand with no filter. The
 * picked card is sent to the revealer's trash (discard).
 */
const abilities: Ability[] = [
  {
    effect: {
      onPicked: "discard",
      target: { type: "player", which: "opponent" },
      type: "reveal-hand",
    },
    trigger: { event: "play-self" },
    type: "triggered",
  },
];

export const mindsplitter: UnitCard = {
  abilities,
  cardNumber: 192,
  cardType: "unit",
  domain: "chaos",
  energyCost: 7,
  id: createCardId("ogn-192-298"),
  might: 7,
  name: "Mindsplitter",
  rarity: "rare",
  rulesText:
    "When you play me, choose an opponent. They reveal their hand. Choose a card from it, and they discard that card.",
  setId: "OGN",
};
