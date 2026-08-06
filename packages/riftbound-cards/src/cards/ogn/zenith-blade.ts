import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const zenithBlade: SpellCard = {
  // rule 355.13 / 423 — the stun is mandatory; "You may move a friendly unit
  // to that enemy unit's battlefield" is optional and its destination is fixed
  // to the stunned unit's battlefield, neither of which the parser expresses.
  abilities: [
    {
      effect: {
        effects: [
          {
            target: { controller: "enemy", location: "battlefield", type: "unit" },
            type: "stun",
          },
          {
            optional: true,
            target: { controller: "friendly", type: "unit" },
            to: "target-battlefield",
            type: "move",
          },
        ],
        type: "sequence",
      },
      timing: "action",
      type: "spell",
    },
  ],
  cardNumber: 262,
  cardType: "spell",
  domain: ["calm", "order"],
  energyCost: 3,
  id: createCardId("ogn-262-298"),
  name: "Zenith Blade",
  rarity: "epic",
  rulesText:
    "[Action] (Play on your turn or in showdowns.)\nStun an enemy unit at a battlefield. You may move a friendly unit to that enemy unit's battlefield. (A stunned unit doesn't deal combat damage this turn.)",
  setId: "OGN",
  timing: "action",
};
