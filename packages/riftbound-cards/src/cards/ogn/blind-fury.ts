import type { Ability } from "@tcg/riftbound-types";
import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Blind Fury — ogn-025-298
 *
 * "[Action] Each opponent reveals the top card of their Main Deck. Choose one
 * and banish it, then play it, ignoring its cost. Then recycle the rest."
 *
 * rule 354.2 — the reveal names no play-time board target: each opponent
 * reveals their top card, and the caster chooses among the revealed cards on
 * resolution (banish the pick, play it ignoring its cost per rule 356.1.b.1,
 * recycle the rest to the bottom of their owners' Main Decks).
 */
const abilities: Ability[] = [
  {
    effect: {
      from: "opponent-decks",
      ignoreCost: true,
      type: "reveal",
    },
    timing: "action",
    type: "spell",
  },
] as unknown as Ability[];

export const blindFury: SpellCard = {
  abilities,
  cardNumber: 25,
  cardType: "spell",
  domain: "fury",
  energyCost: 4,
  id: createCardId("ogn-025-298"),
  name: "Blind Fury",
  rarity: "rare",
  rulesText:
    "[Action] (Play on your turn or in showdowns.)\nEach opponent reveals the top card of their Main Deck. Choose one and banish it, then play it, ignoring its cost. Then recycle the rest.",
  setId: "OGN",
  timing: "action",
};
