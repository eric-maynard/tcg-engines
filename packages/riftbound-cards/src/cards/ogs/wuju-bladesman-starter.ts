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
    // rule 364.3 / 464.2.c.3 — the subject is the friendly unit, not the legend,
    // so the combat state is checked per target ("while-unit-state"); an
    // `alone-in-combat` condition is read against the SOURCE, which is a legend
    // in the legend zone and therefore never defending.
    condition: { state: "defending-alone", type: "while-unit-state" },
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
