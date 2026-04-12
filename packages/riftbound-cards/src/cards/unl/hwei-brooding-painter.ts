import type { Ability } from "@tcg/riftbound-types";
import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Hwei, Brooding Painter — unl-080-219
 *
 * "When I move, draw 1, then discard 1. Then, do the following based on the
 *  discarded card's type:
 *   Spell — Draw 1.
 *   Gear — Ready up to 2 runes.
 *   Unit — Give me +3 [Might] this turn."
 *
 * Modeled as a triggered sequence: draw 1, discard 1, then a choice between
 * the 3 branches (approximation — the real branch is determined by the
 * discarded card's type).
 */
const abilities: Ability[] = [
  {
    effect: {
      effects: [
        { amount: 1, type: "draw" },
        { amount: 1, type: "discard" },
        {
          options: [
            { effect: { amount: 1, type: "draw" }, label: "Spell" },
            {
              effect: {
                target: { controller: "friendly", quantity: 2, type: "rune" },
                type: "ready",
              },
              label: "Gear",
            },
            {
              effect: {
                amount: 3,
                duration: "turn",
                target: "self",
                type: "modify-might",
              },
              label: "Unit",
            },
          ],
          type: "choice",
        },
      ],
      type: "sequence",
    },
    trigger: { event: "move", on: "self" },
    type: "triggered",
  },
];

export const hweiBroodingPainter: UnitCard = {
  abilities,
  cardNumber: 80,
  cardType: "unit",
  domain: "mind",
  energyCost: 5,
  id: createCardId("unl-080-219"),
  isChampion: true,
  might: 5,
  name: "Hwei, Brooding Painter",
  rarity: "rare",
  rulesText:
    "When I move, draw 1, then discard 1. Then, do the following based on the discarded card's type:Spell — Draw 1.Gear — Ready up to 2 runes.Unit — Give me +3 [Might] this turn.",
  setId: "UNL",
  tags: ["Hwei"],
};
