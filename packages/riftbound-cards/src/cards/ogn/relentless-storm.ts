import type { Ability } from "@tcg/riftbound-types";
import type { LegendCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Relentless Storm — ogn-249-298 (Legend, Volibear)
 *
 * When you play a [Mighty] unit, you may exhaust me to channel 1 rune
 * exhausted.
 *
 * Modelled as a play-card trigger on friendly mighty units, with an
 * exhaust-self pay-cost gating the channel-exhausted effect.
 */
const abilities: Ability[] = [
  {
    condition: {
      cost: { exhaust: true },
      type: "pay-cost",
    },
    effect: { amount: 1, exhausted: true, type: "channel" },
    optional: true,
    trigger: {
      event: "play-card",
      on: {
        cardType: "unit",
        controller: "friendly",
        filter: "mighty",
      },
    },
    type: "triggered",
  },
];

export const relentlessStorm: LegendCard = {
  abilities,
  cardNumber: 249,
  cardType: "legend",
  championTag: "Volibear",
  domain: ["fury", "body"],
  id: createCardId("ogn-249-298"),
  name: "Relentless Storm",
  rarity: "rare",
  rulesText:
    "When you play a [Mighty] unit, you may exhaust me to channel 1 rune exhausted. (A unit is Mighty while it has 5+ [Might].)",
  setId: "OGN",
};
