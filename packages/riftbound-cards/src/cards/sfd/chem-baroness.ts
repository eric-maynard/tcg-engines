import type { Ability } from "@tcg/riftbound-types";
import type { LegendCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Clause 1 is exactly what the parser already produces. Clause 2 has no other
 * printing in the set ("your Gold [ADD] an additional [1]"), so it is written
 * out here as a static the Add path consults while it resolves — rule 429.1
 * (the amount Added is computed at resolution) and rule 383.2.a.1 ("within N
 * points of the Victory Score").
 */
const abilities = [
  {
    condition: { cost: { exhaust: true }, type: "pay-cost" },
    effect: { ready: false, token: { name: "Gold", type: "gear" }, type: "create-token" },
    optional: true,
    trigger: { event: "hold", on: "controller-or-allies" },
    type: "triggered",
  },
  {
    condition: { points: 3, type: "score-within", whose: "your" },
    effect: {
      energy: 1,
      target: { controller: "friendly", filter: { name: "Gold" }, type: "gear" },
      type: "add-resource-bonus",
    },
    type: "static",
  },
] as unknown as Ability[];

export const chemBaroness: LegendCard = {
  abilities,
  cardNumber: 201,
  cardType: "legend",
  championTag: "Renata Glasc",
  domain: ["mind", "order"],
  id: createCardId("sfd-201-221"),
  name: "Chem-Baroness",
  rarity: "rare",
  rulesText:
    "When you or an ally hold, you may exhaust me to play a Gold gear token exhausted.\nWhile your score is within 3 points of the Victory Score, your Gold [ADD] an additional [1].",
  setId: "SFD",
};
