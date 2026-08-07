import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const crescentGuardian: UnitCard = {
  // rule 356.2.b.1 / 369.3 — an OPTIONAL additional cost of one [chaos],
  // offered only when its controller has already played a spell this turn
  // (rule 191.1), whose payment makes the unit enter ready.
  abilities: [
    {
      condition: { event: "played-spell", type: "this-turn" },
      effect: {
        additionalCost: { power: ["chaos"] },
        ifPaid: { type: "enter-ready" },
        type: "additional-cost-option",
      },
      type: "static",
    },
  ] as UnitCard["abilities"],
  cardNumber: 122,
  cardType: "unit",
  domain: "chaos",
  energyCost: 4,
  id: createCardId("unl-122-219"),
  might: 4,
  name: "Crescent Guardian",
  rarity: "common",
  rulesText:
    "If you've played a spell this turn, you may pay [chaos] as an additional cost to play me. If you do, I enter ready.",
  setId: "UNL",
};
