import type { LegendCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const bountyHunter: LegendCard = {
  cardNumber: 267,
  cardType: "legend",
  championTag: "Miss Fortune",
  domain: ["body", "chaos"],
  id: createCardId("ogn-267-298"),
  name: "Bounty Hunter",
  rarity: "rare",
  rulesText:
    "[Exhaust]: Give a unit [Ganking] this turn. (It can move from battlefield to battlefield.)",
  setId: "OGN",
};
