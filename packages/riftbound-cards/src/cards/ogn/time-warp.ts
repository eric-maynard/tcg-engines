import type { Ability } from "@tcg/riftbound-types";
import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

// Rule 734: "Take a turn after this one" inserts an additional turn for the
// resolving player directly after the current turn. "Banish this" moves the
// spell to banishment as its final instruction.
const abilities: Ability[] = [
  {
    effect: {
      effects: [
        { type: "extra-turn" },
        { target: "self", type: "banish" },
      ],
      type: "sequence",
    },
    timing: "action",
    type: "spell",
  },
];

export const timeWarp: SpellCard = {
  abilities,
  cardNumber: 122,
  cardType: "spell",
  domain: "mind",
  energyCost: 10,
  id: createCardId("ogn-122-298"),
  name: "Time Warp",
  rarity: "epic",
  rulesText: "Take a turn after this one. Banish this.",
  setId: "OGN",
  timing: "action",
};
