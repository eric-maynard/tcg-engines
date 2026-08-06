import type { Ability } from "@tcg/riftbound-types";
import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Mageseeker Warden — ogn-070-298
 *
 * rule 355.2 — the first line is a play-location restriction aimed at the
 * Warden's OPPONENTS, so it is modelled as a `play-restriction` static with
 * `appliesTo: "opponents"`; the play moves read it off enemy board cards.
 * The second line stays as a free-text restriction pending engine support.
 */
const abilities: Ability[] = [
  {
    condition: { type: "while-at-battlefield" },
    effect: {
      allowedLocation: "their base",
      appliesTo: "opponents",
      type: "play-restriction",
    },
    type: "static",
  },
  {
    condition: { type: "while-at-battlefield" },
    effect: {
      // rule 466 — structured form the ready effect handler reads; the free
      // text alone was never enforced.
      restriction: "cant-ready-enemy",
      text: "spells and abilities can't ready enemy units and gear.",
      type: "restriction",
    },
    type: "static",
  },
] as unknown as Ability[];

export const mageseekerWarden: UnitCard = {
  abilities,
  cardNumber: 70,
  cardType: "unit",
  domain: "calm",
  energyCost: 6,
  id: createCardId("ogn-070-298"),
  might: 5,
  name: "Mageseeker Warden",
  rarity: "rare",
  rulesText:
    "While I'm at a battlefield, opponents can only play units to their base.\nWhile I'm at a battlefield, spells and abilities can't ready enemy units and gear.",
  setId: "OGN",
};
