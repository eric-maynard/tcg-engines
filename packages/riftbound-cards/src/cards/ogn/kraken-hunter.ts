import type { Ability } from "@tcg/riftbound-types";
import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Kraken Hunter — ogn-150-298
 *
 * [Accelerate] (pay [1][body] as additional cost to enter ready.)
 * [Assault] (+1 Might while attacker.)
 * As you play me, you may spend any number of buffs as an additional cost.
 * Reduce my cost by [body] for each buff you spend.
 *
 * The Accelerate and Assault keywords are standard. The custom cost
 * reduction via buffs is captured as a static helper keyword
 * `BuffCostReduction` that the engine's cost pipeline can honor later.
 */
const abilities: Ability[] = [
  { cost: { energy: 1, power: ["body"] }, keyword: "Accelerate", type: "keyword" },
  { keyword: "Assault", type: "keyword", value: 1 },
  {
    effect: {
      keyword: "BuffCostReduction",
      target: "self",
      type: "grant-keyword",
    },
    type: "static",
  },
];

export const krakenHunter: UnitCard = {
  abilities,
  cardNumber: 150,
  cardType: "unit",
  domain: "body",
  energyCost: 3,
  id: createCardId("ogn-150-298"),
  might: 5,
  name: "Kraken Hunter",
  rarity: "rare",
  rulesText:
    "[Accelerate] (You may pay [1][body] as an additional cost to have me enter ready.)\n[Assault] (+1 [Might] while I'm an attacker.)\nAs you play me, you may spend any number of buffs as an additional cost. Reduce my cost by [body] for each buff you spend.",
  setId: "OGN",
};
