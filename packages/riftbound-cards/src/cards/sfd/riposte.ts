import type { Ability } from "@tcg/riftbound-types";
import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Riposte — sfd-206-221 (Reaction spell)
 *
 * Choose a friendly unit and a spell. Counter that spell and give that unit
 * +[Might] equal to that spell's Energy cost this turn.
 *
 * rule-id: sfd-206-221 — the parser collapses this to a bare `counter`, so the
 * Might buff is encoded explicitly: `amount: { cost: { type: "spell" } }`
 * reads the countered chain item's Energy cost at resolution.
 */
const abilities: Ability[] = [
  {
    effect: {
      effects: [
        { type: "counter" },
        {
          amount: { cost: { type: "spell" } },
          duration: "turn",
          target: { controller: "friendly", type: "unit" },
          type: "modify-might",
        },
      ],
      type: "sequence",
    },
    timing: "reaction",
    type: "spell",
  },
];

export const riposte: SpellCard = {
  abilities,
  cardNumber: 206,
  cardType: "spell",
  domain: ["body", "order"],
  energyCost: 2,
  id: createCardId("sfd-206-221"),
  name: "Riposte",
  rarity: "epic",
  rulesText:
    "[Reaction] (Play any time, even before spells and abilities resolve.)\nChoose a friendly unit and a spell. Counter that spell and give that unit +[Might] equal to that spell's Energy cost this turn.",
  setId: "SFD",
  timing: "reaction",
};
