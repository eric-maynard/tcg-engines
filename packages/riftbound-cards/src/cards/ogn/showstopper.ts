import type { Ability } from "@tcg/riftbound-types";
import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * "Buff a friendly unit in your base, then move it to a battlefield."
 *
 * rule 702/703 — the buff is a +1 Might marker; rule 450 / 190.3.a — the same
 * unit ("it") then moves to a battlefield of the caster's choice, contesting it
 * when its controller doesn't control it. The parser only sees the buff clause
 * and drops the base restriction, so the pair is spelled out here.
 */
const abilities: Ability[] = [
  {
    effect: {
      effects: [
        { target: { controller: "friendly", location: "base", type: "unit" }, type: "buff" },
        { target: { type: "pending-value" }, to: { battlefield: "any" }, type: "move" },
      ],
      pendingValue: { source: 0 },
      type: "sequence",
    },
    timing: "action",
    type: "spell",
  } as unknown as Ability,
];

export const showstopper: SpellCard = {
  abilities,
  cardNumber: 270,
  cardType: "spell",
  domain: ["body", "order"],
  energyCost: 1,
  id: createCardId("ogn-270-298"),
  name: "Showstopper",
  rarity: "epic",
  rulesText:
    "Buff a friendly unit in your base, then move it to a battlefield. (If it doesn't have a buff, it gets a +1 [Might] buff.)",
  setId: "OGN",
  timing: "action",
};
