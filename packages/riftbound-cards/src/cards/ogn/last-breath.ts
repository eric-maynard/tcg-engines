import type { Ability } from "@tcg/riftbound-types";
import type { Effect } from "@tcg/riftbound-types/abilities/effect-types";
import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * "Ready a friendly unit. It deals damage equal to its Might to an enemy unit
 * at a battlefield."
 *
 * rule 355.14.a — "its Might" names the unit readied by the first step, so the
 * damage amount references that step's chosen target (`pendingValue`), not the
 * spell or the damaged unit.
 */
const abilities: Ability[] = [
  {
    effect: {
      effects: [
        { target: { controller: "friendly", type: "unit" }, type: "ready" },
        {
          amount: { might: "pending-value" },
          target: { controller: "enemy", location: "battlefield", type: "unit" },
          type: "damage",
        } as unknown as Effect,
      ],
      pendingValue: { source: 0 },
      type: "sequence",
    },
    timing: "action",
    type: "spell",
  },
];

export const lastBreath: SpellCard = {
  abilities,
  cardNumber: 260,
  cardType: "spell",
  domain: ["calm", "chaos"],
  energyCost: 3,
  id: createCardId("ogn-260-298"),
  name: "Last Breath",
  rarity: "epic",
  rulesText:
    "[Action] (Play on your turn or in showdowns.)\nReady a friendly unit. It deals damage equal to its Might to an enemy unit at a battlefield.",
  setId: "OGN",
  timing: "action",
};
