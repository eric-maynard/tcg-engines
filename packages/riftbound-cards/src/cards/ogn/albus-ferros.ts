import type { Ability } from "@tcg/riftbound-types";
import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Albus Ferros — ogn-230-298
 *
 * "When you play me, spend any number of buffs. For each buff spent,
 *  channel 1 rune exhausted."
 *
 * Play-self trigger that spends any number of buffs on friendly units; each
 * buff spent channels 1 rune exhausted.
 *
 * rule 355.13: `quantity: "any"` makes the resolution prompt a 0..N pick that
 * may always be declined (702.2.b.2 — only friendly buffs may be spent).
 */
const abilities: Ability[] = [
  {
    effect: {
      target: { controller: "friendly", filter: "buffed", quantity: "any", type: "unit" },
      then: { amount: 1, exhausted: true, type: "channel" },
      type: "spend-buff",
    },
    trigger: { event: "play-self" },
    type: "triggered",
  },
];

export const albusFerros: UnitCard = {
  abilities,
  cardNumber: 230,
  cardType: "unit",
  domain: "order",
  energyCost: 4,
  id: createCardId("ogn-230-298"),
  might: 3,
  name: "Albus Ferros",
  rarity: "rare",
  rulesText:
    "When you play me, spend any number of buffs. For each buff spent, channel 1 rune exhausted.",
  setId: "OGN",
};
