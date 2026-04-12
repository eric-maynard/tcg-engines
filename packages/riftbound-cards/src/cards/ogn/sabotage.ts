import type { Ability } from "@tcg/riftbound-types";
import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Sabotage — ogn-156-298 (Action spell)
 *
 * "Choose an opponent. They reveal their hand. Choose a non-unit card from
 * it, and recycle that card."
 *
 * Implemented via the engine's `reveal-hand` primitive, which places a
 * `pendingChoice` on the game state. The active player then resolves the
 * choice by picking a non-unit card from the revealed hand; that card is
 * sent to the bottom of its owner's main deck (recycle).
 */
const abilities: Ability[] = [
  {
    effect: {
      filter: { excludeCardTypes: ["unit"] },
      onPicked: "recycle",
      target: { type: "player", which: "opponent" },
      type: "reveal-hand",
    },
    timing: "action",
    type: "spell",
  },
];

export const sabotage: SpellCard = {
  abilities,
  cardNumber: 156,
  cardType: "spell",
  domain: "body",
  energyCost: 1,
  id: createCardId("ogn-156-298"),
  name: "Sabotage",
  rarity: "rare",
  rulesText:
    "Choose an opponent. They reveal their hand. Choose a non-unit card from it, and recycle that card.",
  setId: "OGN",
  timing: "action",
};
