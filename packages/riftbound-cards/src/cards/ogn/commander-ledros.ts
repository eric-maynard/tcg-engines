import type { Ability } from "@tcg/riftbound-types";
import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Unique phrasing (rule 356.2.b / 356.4): "kill ANY NUMBER of friendly units as
 * an additional cost. Reduce my cost by [order] for each killed this way" — a
 * variable-count sacrifice whose payoff waives one Power pip per kill, the same
 * shape as ogn-150-298's spend-any-number-of-buffs cost.
 */
const abilities: Ability[] = [
  {
    effect: {
      additionalCost: { killAnyNumber: { controller: "friendly", type: "unit" } },
      ifPaid: { reducePower: "order", type: "cost-reduction" },
      optional: true,
      type: "additional-cost-option",
    },
    type: "static",
  },
  { keyword: "Deflect", type: "keyword", value: 1 },
  { keyword: "Ganking", type: "keyword" },
] as unknown as Ability[];

export const commanderLedros: UnitCard = {
  abilities,
  cardNumber: 231,
  cardType: "unit",
  domain: "order",
  energyCost: 6,
  id: createCardId("ogn-231-298"),
  might: 8,
  name: "Commander Ledros",
  rarity: "rare",
  rulesText:
    "As you play me, you may kill any number of friendly units as an additional cost. Reduce my cost by [order] for each killed this way.\n[Deflect] (Opponents must pay [rainbow] to choose me with a spell or ability.)\n[Ganking] (I can move from battlefield to battlefield.)",
  setId: "OGN",
};
