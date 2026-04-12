import type { Ability } from "@tcg/riftbound-types";
import type { LegendCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Grand Duelist — sfd-205-221 (Legend, Fiora)
 *
 * When one of your units becomes [Mighty], you may exhaust me to channel
 * 1 rune exhausted.
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
      event: "become-mighty",
      on: "friendly-units",
    },
    type: "triggered",
  },
];

export const grandDuelist: LegendCard = {
  abilities,
  cardNumber: 205,
  cardType: "legend",
  championTag: "Fiora",
  domain: ["body", "order"],
  id: createCardId("sfd-205-221"),
  name: "Grand Duelist",
  rarity: "rare",
  rulesText:
    "When one of your units becomes [Mighty], you may exhaust me to channel 1 rune exhausted. (A unit is Mighty while it has 5+ [Might].)",
  setId: "SFD",
};
