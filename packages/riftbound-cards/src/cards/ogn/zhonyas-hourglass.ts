import type { Ability } from "@tcg/riftbound-types";
import type { GearCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Zhonya's Hourglass — ogn-077-298 (Gear)
 *
 * [Hidden]
 * If a friendly unit would die, kill this instead. Heal that unit,
 * exhaust it, and recall it.
 */
const abilities: Ability[] = [
  { keyword: "Hidden", type: "keyword" },
  {
    replacement: {
      effects: [
        { target: "self", type: "kill" },
        { amount: "all", target: { type: "trigger-source" }, type: "heal" },
        { target: { type: "trigger-source" }, type: "exhaust" },
        { target: { type: "trigger-source" }, type: "recall" },
      ],
      type: "sequence",
    },
    replaces: "die",
    target: { controller: "friendly", type: "unit" },
    type: "replacement",
  },
];

export const zhonyasHourglass: GearCard = {
  abilities,
  cardNumber: 77,
  cardType: "gear",
  domain: "calm",
  energyCost: 2,
  id: createCardId("ogn-077-298"),
  name: "Zhonya's Hourglass",
  rarity: "rare",
  rulesText:
    "[Hidden] (Hide now for [rainbow] to react with later for [energy_0].)\nIf a friendly unit would die, kill this instead. Heal that unit, exhaust it, and recall it. (Send it to base. This isn't a move.)",
  setId: "OGN",
};
