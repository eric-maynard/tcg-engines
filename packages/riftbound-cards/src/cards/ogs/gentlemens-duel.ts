import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const gentlemensDuel: SpellCard = {
  // rule 417.6.b.3 — the pump lands on the chosen attacker BEFORE the two units
  // exchange Might-equal damage, so it rides as the fight's `onAttacker` step.
  // Explicit because the parser's fight matcher is end-anchored on "…to each
  // other." and would otherwise swallow (and drop) the leading pump clause.
  abilities: [
    {
      effect: {
        attacker: { controller: "friendly", type: "unit" },
        defender: { controller: "enemy", type: "unit" },
        onAttacker: {
          amount: 3,
          duration: "turn",
          target: { controller: "friendly", type: "unit" },
          type: "modify-might",
        },
        type: "fight",
      },
      timing: "action",
      type: "spell",
    },
  ],
  cardNumber: 8,
  cardType: "spell",
  domain: "body",
  energyCost: 6,
  id: createCardId("ogs-008-024"),
  name: "Gentlemen's Duel",
  rarity: "common",
  rulesText:
    "[Action] (Play on your turn or in showdowns.)\nGive a friendly unit +3 [Might] this turn. Then choose an enemy unit. They deal damage equal to their Mights to each other.",
  setId: "OGS",
  timing: "action",
};
