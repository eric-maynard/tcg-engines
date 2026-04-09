import type { LegendCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const grandDuelist: LegendCard = {
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
