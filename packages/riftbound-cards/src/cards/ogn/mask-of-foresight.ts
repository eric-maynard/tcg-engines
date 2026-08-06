import type { Ability } from "@tcg/riftbound-types";
import type { GearCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

// rule 740.2.a — "alone" means no other friendly unit shares the attacking or
// defending unit's battlefield; the bonus goes to that unit ("give IT"), not
// to the gear. The parser's `attack-or-defend-alone` event only matched
// `attack` and dropped the "alone" qualifier entirely.
const abilities: Ability[] = [
  {
    effect: {
      amount: 1,
      duration: "turn",
      target: { type: "trigger-source" },
      type: "modify-might",
    },
    trigger: {
      event: "attack-or-defend",
      on: { controller: "friendly", filter: ["alone"], type: "unit" },
    },
    type: "triggered",
  } as unknown as Ability,
];

export const maskOfForesight: GearCard = {
  abilities,
  cardNumber: 60,
  cardType: "gear",
  domain: "calm",
  energyCost: 2,
  id: createCardId("ogn-060-298"),
  name: "Mask of Foresight",
  rarity: "uncommon",
  rulesText: "When a friendly unit attacks or defends alone, give it +1 [Might] this turn.",
  setId: "OGN",
};
