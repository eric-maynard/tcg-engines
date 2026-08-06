import type { Ability, Effect } from "@tcg/riftbound-types";
import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

// rule-id: ogn-258-298 — the parser reads "They deal damage equal to their
// Mights to each other" as a Challenge and demands a friendly+enemy pair.
// Only ENEMY units are involved: the caster chooses one enemy unit and its
// destination (rule 355.4), then the reflexive "do this" (rule 387) picks
// another enemy unit AT THAT destination to trade Might damage with it.
const abilities: Ability[] = [
  {
    effect: {
      target: { controller: "enemy", type: "unit" },
      then: {
        attacker: { controller: "enemy", type: "unit" },
        defender: { controller: "enemy", excludeSelf: true, location: "same", type: "unit" },
        type: "fight",
      },
      to: "choose",
      type: "move",
    } as unknown as Effect,
    type: "spell",
  },
];

export const dragonsRage: SpellCard = {
  abilities,
  cardNumber: 258,
  cardType: "spell",
  domain: ["calm", "body"],
  energyCost: 4,
  id: createCardId("ogn-258-298"),
  name: "Dragon's Rage",
  rarity: "epic",
  rulesText:
    "Move an enemy unit. Then do this: Choose another enemy unit at its destination. They deal damage equal to their Mights to each other.",
  setId: "OGN",
  timing: "action",
};
