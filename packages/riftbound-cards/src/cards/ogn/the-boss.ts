import type { Ability } from "@tcg/riftbound-types";
import type { LegendCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * The Boss — ogn-269-298 (Legend · Sett)
 *
 * If a buffed unit you control would die, you may pay [rainbow], exhaust me,
 * and spend its buff to heal it, exhaust it, and recall it instead.
 * When you conquer, ready me.
 *
 * The first line is an OPTIONAL, COSTED die replacement (rules 371.2 / 372):
 * `condition: pay-cost` carries the [rainbow] + [Exhaust]-me payment asked of
 * the legend's controller when a buffed friendly unit would die; spending that
 * unit's buff (702.2.b) leads the replacement sequence so it is paid before the
 * heal / exhaust / recall.
 */
const abilities: Ability[] = [
  {
    condition: { cost: { exhaust: true, power: ["rainbow"] }, type: "pay-cost" },
    duration: "permanent",
    replacement: {
      effects: [
        { target: { type: "trigger-source" }, type: "spend-buff" },
        { amount: "all", target: { type: "trigger-source" }, type: "heal" },
        { target: { type: "trigger-source" }, type: "exhaust" },
        { target: { type: "trigger-source" }, type: "recall" },
      ],
      type: "sequence",
    },
    replaces: "die",
    target: { controller: "friendly", filter: "buffed", type: "unit" },
    type: "replacement",
  } as unknown as Ability,
  {
    effect: { target: "self", type: "ready" },
    trigger: { event: "conquer", on: "controller" },
    type: "triggered",
  } as unknown as Ability,
];

export const theBoss: LegendCard = {
  abilities,
  cardNumber: 269,
  cardType: "legend",
  championTag: "Sett",
  domain: ["body", "order"],
  id: createCardId("ogn-269-298"),
  name: "The Boss",
  rarity: "rare",
  rulesText:
    "If a buffed unit you control would die, you may pay [rainbow], exhaust me, and spend its buff to heal it, exhaust it, and recall it instead. (Send it to base. This isn't a move.)\nWhen you conquer, ready me.",
  setId: "OGN",
};
