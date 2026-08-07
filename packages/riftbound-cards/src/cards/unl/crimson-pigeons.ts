import type { Ability } from "@tcg/riftbound-types";
import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

// rule 364.3.a: a conditional passive — the +2 exists only while I hold the
// Attacker designation AND another friendly unit is attacking here with me.
const abilities: Ability[] = [
  {
    condition: {
      conditions: [
        { type: "attacking" },
        {
          target: {
            controller: "friendly",
            excludeSelf: true,
            filter: "attacking",
            type: "unit",
          },
          type: "exists-here",
        },
      ],
      type: "and",
    },
    effect: { amount: 2, target: "self", type: "modify-might" },
    type: "static",
  },
] as unknown as Ability[];

export const crimsonPigeons: UnitCard = {
  abilities,
  cardNumber: 154,
  cardType: "unit",
  domain: "order",
  energyCost: 3,
  id: createCardId("unl-154-219"),
  might: 3,
  name: "Crimson Pigeons",
  rarity: "common",
  rulesText: "I have +2 [Might] while I'm attacking with another unit.",
  setId: "UNL",
};
