import type { Ability } from "@tcg/riftbound-types";
import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Twisted Fate, Gambler — ogn-200-298
 *
 * "When I attack, reveal the top rune of your rune deck, then recycle it.
 *  Do one of the following based on its domain:
 *   [fury] — Deal 2 to an enemy unit here and 1 to all other enemy units
 *            here.
 *   [mind] — Draw 1.
 *   [order] — Stun an enemy unit."
 *
 * Modeled as a triggered sequence: reveal-from-rune-deck, recycle, then a
 * choice of 3 branches (approximating the actual domain-gated switch).
 */
const abilities: Ability[] = [
  {
    effect: {
      effects: [
        {
          amount: 1,
          from: "rune-deck",
          type: "look",
        },
        {
          from: "board",
          target: { type: "rune" },
          type: "recycle",
        },
        {
          options: [
            {
              effect: {
                effects: [
                  {
                    amount: 2,
                    target: {
                      controller: "enemy",
                      location: "here",
                      quantity: 1,
                      type: "unit",
                    },
                    type: "damage",
                  },
                  {
                    amount: 1,
                    target: {
                      controller: "enemy",
                      excludeSelf: true,
                      location: "here",
                      quantity: "all",
                      type: "unit",
                    },
                    type: "damage",
                  },
                ],
                type: "sequence",
              },
              label: "fury",
            },
            {
              effect: { amount: 1, type: "draw" },
              label: "mind",
            },
            {
              effect: {
                target: { controller: "enemy", type: "unit" },
                type: "stun",
              },
              label: "order",
            },
          ],
          type: "choice",
        },
      ],
      type: "sequence",
    },
    trigger: { event: "attack", on: "self" },
    type: "triggered",
  },
];

export const twistedFateGambler: UnitCard = {
  abilities,
  cardNumber: 200,
  cardType: "unit",
  domain: "chaos",
  energyCost: 4,
  id: createCardId("ogn-200-298"),
  isChampion: true,
  might: 4,
  name: "Twisted Fate, Gambler",
  rarity: "rare",
  rulesText:
    "When I attack, reveal the top rune of your rune deck, then recycle it. Do one of the following based on its domain:[fury] — Deal 2 to an enemy unit here and 1 to all other enemy units here.[mind] — Draw 1.[order] — Stun an enemy unit.",
  setId: "OGN",
  tags: ["Twisted Fate"],
};
