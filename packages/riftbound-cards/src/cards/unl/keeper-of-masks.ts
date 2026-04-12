import type { Ability } from "@tcg/riftbound-types";
import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Keeper of Masks — unl-081-219
 *
 * [Hidden]
 * [Temporary]
 * When you play me, play two Reflection unit tokens here. They become
 * copies of me.
 */
const abilities: Ability[] = [
  { keyword: "Hidden", type: "keyword" },
  { keyword: "Temporary", type: "keyword" },
  {
    effect: {
      amount: 2,
      location: "here",
      token: {
        keywords: ["CopyOnPlay"],
        might: 0,
        name: "Reflection",
        type: "unit",
      },
      type: "create-token",
    },
    trigger: { event: "play-self" },
    type: "triggered",
  },
];

export const keeperOfMasks: UnitCard = {
  abilities,
  cardNumber: 81,
  cardType: "unit",
  domain: "mind",
  energyCost: 2,
  id: createCardId("unl-081-219"),
  might: 1,
  name: "Keeper of Masks",
  rarity: "rare",
  rulesText:
    "[Hidden] (Hide now for [rainbow] to react with later for [energy_0].)\n[Temporary] (Kill me at the start of my controller's Beginning Phase, before scoring.)\nWhen you play me, play two Reflection unit tokens here. They become copies of me.",
  setId: "UNL",
};
