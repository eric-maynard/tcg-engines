import type { LegendCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const deceiver: LegendCard = {
  cardNumber: 199,
  cardType: "legend",
  championTag: "LeBlanc",
  domain: ["mind", "order"],
  id: createCardId("unl-199-219"),
  name: "Deceiver",
  rarity: "rare",
  rulesText:
    "When you conquer or hold, you may discard 1 and exhaust me to play a ready Reflection unit token there. It becomes a copy of another unit there. Give it [Temporary].",
  setId: "UNL",
};
