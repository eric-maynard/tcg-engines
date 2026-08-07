import type { Ability } from "@tcg/riftbound-types";
import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Vex, Mocking — unl-055-219
 *
 * "[Shield 1]
 *  [Tank]
 *  When you [Stun] an enemy unit at a battlefield, you may move me to that
 *  battlefield."
 */
const abilities: Ability[] = [
  { keyword: "Shield", type: "keyword", value: 1 },
  { keyword: "Tank", type: "keyword" },
  {
    effect: {
      target: "self",
      // rule 359.3.f.3 — "that battlefield" is the battlefield named by the
      // firing stun event, not Vex's own location.
      to: "there",
      type: "move",
    },
    optional: true,
    trigger: {
      event: "stun",
      on: {
        // rule 383.4.b — "when YOU stun": the stun must be performed by Vex's
        // controller, so an opponent's stun (even on their own unit) is silent.
        actor: "controller",
        cardType: "unit",
        controller: "enemy",
        location: "battlefield",
      },
    },
    type: "triggered",
  },
];

export const vexMocking: UnitCard = {
  abilities,
  cardNumber: 55,
  cardType: "unit",
  domain: "calm",
  energyCost: 5,
  id: createCardId("unl-055-219"),
  isChampion: true,
  might: 5,
  name: "Vex, Mocking",
  rarity: "rare",
  rulesText:
    "[Shield] (+1 [Might] while I'm a defender.)\n[Tank] (I must be assigned combat damage first.)\nWhen you [Stun] an enemy unit at a battlefield, you may move me to that battlefield.",
  setId: "UNL",
  tags: ["Vex"],
};
