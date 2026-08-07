import type { Ability } from "@tcg/riftbound-types";
import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

// rule 437.5.b / 437.7: "prevent it" is a delayed replacement with Prevent Value All
// for one damage instance — the parser only sees the "Draw 1" clause, so spell it out.
const abilities: Ability[] = [
  {
    effect: {
      effects: [
        { duration: "turn", instance: true, target: { type: "unit" }, type: "prevent-damage" },
        { amount: 1, type: "draw" },
      ],
      type: "sequence",
    },
    timing: "reaction",
    type: "spell",
  },
];

export const counterStrike: SpellCard = {
  abilities,
  cardNumber: 194,
  cardType: "spell",
  domain: ["calm", "body"],
  energyCost: 2,
  id: createCardId("sfd-194-221"),
  name: "Counter Strike",
  rarity: "epic",
  rulesText:
    "[Reaction] (Play any time, even before spells and abilities resolve.)\nChoose a unit. The next time that unit would be dealt damage this turn, prevent it. Draw 1.",
  setId: "SFD",
  timing: "reaction",
};
