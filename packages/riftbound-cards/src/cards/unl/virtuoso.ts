import type { LegendCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const virtuoso: LegendCard = {
  cardNumber: 181,
  cardType: "legend",
  championTag: "Jhin",
  domain: ["fury", "mind"],
  id: createCardId("unl-181-219"),
  name: "Virtuoso",
  rarity: "rare",
  rulesText:
    "When you play a spell, if you spent [4] or more, you may banish it. Then, if there are four spells banished with me, put each in its trash, channel 4 runes, and draw 1.",
  setId: "UNL",
};
