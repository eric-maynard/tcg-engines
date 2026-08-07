import type { Ability } from "@tcg/riftbound-types";
import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * rule 135.2 — "if you spent [4] or more" measures the Energy actually paid for
 * the TRIGGERING spell (a paid [Repeat] counts), not power spent this turn on
 * other cards, so the trigger carries a `spell-energy-spent` condition.
 */
const abilities: Ability[] = [
  { keyword: "Ganking", type: "keyword" },
  {
    condition: { amount: 4, type: "spell-energy-spent" },
    effect: { target: "self", type: "ready" },
    trigger: { event: "play-spell", on: "controller" },
    type: "triggered",
  },
] as unknown as Ability[];

export const revnaTheLorekeeper: UnitCard = {
  abilities,
  cardNumber: 5,
  cardType: "unit",
  domain: "fury",
  energyCost: 7,
  id: createCardId("unl-005-219"),
  might: 7,
  name: "Revna the Lorekeeper",
  rarity: "common",
  rulesText:
    "[Ganking] (I can move from battlefield to battlefield.)\nWhen you play a spell, if you spent [4] or more, ready me.",
  setId: "UNL",
};
