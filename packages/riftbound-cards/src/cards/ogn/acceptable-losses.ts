import type { Ability } from "@tcg/riftbound-types";
import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Acceptable Losses — ogn-179-298
 *
 * "Each player kills one of their gear." Every player picks among the gear
 * THEY control (rule 422.1.a); a player with none does nothing.
 */
const abilities: Ability[] = [
  {
    effect: {
      player: "each",
      target: { controller: "friendly", quantity: { upTo: 1 }, type: "gear" },
      type: "kill",
    },
    timing: "action",
    type: "spell",
  },
];

export const acceptableLosses: SpellCard = {
  abilities,
  cardNumber: 179,
  cardType: "spell",
  domain: "chaos",
  energyCost: 1,
  id: createCardId("ogn-179-298"),
  name: "Acceptable Losses",
  rarity: "uncommon",
  rulesText: "[Action] (Play on your turn or in showdowns.)\nEach player kills one of their gear.",
  setId: "OGN",
  timing: "action",
};
