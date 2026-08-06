import type { Ability } from "@tcg/riftbound-types";
import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Syndra, Transcendent — unl-146-219
 *
 * While I'm in a showdown, your spells have [Repeat] [2][chaos].
 *
 * rule-id: unl-146-219 — the parser dropped the showdown gate, the Repeat
 * cost, and pointed the grant at friendly units. Hand-authored as a static
 * `grant-keyword` Repeat carrying its cost (rule 820) onto friendly spells,
 * gated on `while-in-showdown`; the engine reads it at spell play time.
 */
const abilities: Ability[] = [
  {
    condition: { type: "while-in-showdown" },
    effect: {
      cost: { energy: 2, power: ["chaos"] },
      keyword: "Repeat",
      target: { controller: "friendly", type: "spell" },
      type: "grant-keyword",
    },
    type: "static",
  },
];

export const syndraTranscendent: UnitCard = {
  abilities,
  cardNumber: 146,
  cardType: "unit",
  domain: "chaos",
  energyCost: 6,
  id: createCardId("unl-146-219"),
  isChampion: true,
  might: 6,
  name: "Syndra, Transcendent",
  rarity: "rare",
  rulesText:
    "While I'm in a showdown, your spells have [Repeat] [2][chaos]. (You may pay the additional cost to repeat the spell's effect.)",
  setId: "UNL",
  tags: ["Syndra"],
};
