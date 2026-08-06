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
    // rule-id: ogn-200-298 — the domain of the revealed rune dictates the
    // branch (no player choice); the rune is recycled to the bottom of the
    // rune deck first.
    effect: {
      branches: {
        fury: {
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
                excludeBound: true,
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
        mind: { amount: 1, type: "draw" },
        order: {
          target: { controller: "enemy", type: "unit" },
          type: "stun",
        },
      },
      type: "reveal-rune-branch",
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
