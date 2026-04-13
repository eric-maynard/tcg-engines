import type { Ability } from "@tcg/riftbound-types";
import type { LegendCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Wuju Bladesman - Starter — ogs-019-024
 *
 * "While a friendly unit defends alone, it gets +2 [Might]."
 */
const abilities: Ability[] = [
  {
    condition: { role: "defending", type: "alone-in-combat" },
    effect: {
      amount: 2,
      target: {
        controller: "friendly",
        filter: ["defending", "alone"],
        type: "unit",
      },
      type: "modify-might",
    },
    type: "static",
  },
];

export const wujuBladesmanStarter: LegendCard = {
  abilities,
  cardNumber: 19,
  cardType: "legend",
  championTag: "Yi",
  domain: ["calm", "body"],
  id: createCardId("ogs-019-024"),
  name: "Wuju Bladesman - Starter",
  rarity: "rare",
  rulesText: "While a friendly unit defends alone, it gets +2 [Might].",
  setId: "OGS",
};
