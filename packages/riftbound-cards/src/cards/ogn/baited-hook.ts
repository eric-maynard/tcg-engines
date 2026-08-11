import type { Ability } from "@tcg/riftbound-types";
import type { GearCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Unique phrasing: the look-at-5 pick is gated on the Might of the unit killed
 * by the same ability ("Might up to 1 more than the killed unit"), and the pick
 * is banished then played for free (rule 356.1.b.1). `maxMightAboveKilled`
 * reads the killed unit's last-known Might recorded by the kill step.
 */
const abilities: Ability[] = [
  {
    cost: { energy: 1, exhaust: true, power: ["order"] },
    effect: {
      effects: [
        { target: { controller: "friendly", type: "unit" }, type: "kill" },
        {
          amount: 5,
          // rule 356.4 / 359.3.e.6 (ruling 5ae85425a6107723) — "you may BANISH
          // a unit … AND play it": the banish is its own instruction, so a unit
          // whose play cannot be performed (Cruel Patron with no friendly unit
          // left to kill) is still a legal pick and simply stays banished.
          banishBeforePlay: true,
          filter: { excludeCardTypes: ["spell", "legend", "battlefield", "rune", "gear", "equipment"] },
          from: "deck",
          ignoreCost: true,
          maxMightAboveKilled: 1,
          onPicked: "play",
          playImmediately: true,
          onRest: "recycle",
          optional: true,
          type: "look",
        },
      ],
      type: "sequence",
    },
    type: "activated",
  },
] as unknown as Ability[];

export const baitedHook: GearCard = {
  abilities,
  cardNumber: 242,
  cardType: "gear",
  domain: "order",
  energyCost: 3,
  id: createCardId("ogn-242-298"),
  name: "Baited Hook",
  rarity: "epic",
  rulesText:
    "[1][order], [Exhaust]: Kill a friendly unit. Look at the top 5 cards of your Main Deck. You may banish a unit from among them that has Might up to 1 more than the killed unit and play it, ignoring its cost. Then recycle the rest.",
  setId: "OGN",
};
