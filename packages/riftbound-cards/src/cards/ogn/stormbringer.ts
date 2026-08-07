import type { Ability, Effect } from "@tcg/riftbound-types";
import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

// rule-id: ogn-250-298 — rule 355.8 / 355.14.a: the parser collapses "equal to
// ITS Might" to `might: "self"` (the spell has no Might) and drops the trailing
// move, so hand-author the spell. TWO caster-chosen targets lock at play time:
// the friendly base unit whose Might is the damage amount (targets[0]) and the
// battlefield whose enemy units are hit (targets[1], an all-at-one-battlefield
// selection). `to: "chosen-battlefield"` then walks targets[0] to targets[1].
const chosenBaseUnit = { controller: "friendly", location: "base", type: "unit" } as const;

const abilities: Ability[] = [
  {
    effect: {
      effects: [
        {
          amount: { might: { ...chosenBaseUnit } },
          target: { controller: "enemy", location: "battlefield", quantity: "all", type: "unit" },
          type: "damage",
        },
        {
          reference: { ...chosenBaseUnit },
          to: "chosen-battlefield",
          type: "move",
        },
      ],
      type: "sequence",
    } as unknown as Effect,
    timing: "action",
    type: "spell",
  },
];

export const stormbringer: SpellCard = {
  abilities,
  cardNumber: 250,
  cardType: "spell",
  domain: ["fury", "body"],
  energyCost: 6,
  id: createCardId("ogn-250-298"),
  name: "Stormbringer",
  rarity: "epic",
  rulesText:
    "Choose a friendly unit in your base. Deal damage equal to its Might to all enemy units at a battlefield, then move your unit there.",
  setId: "OGN",
  timing: "action",
};
