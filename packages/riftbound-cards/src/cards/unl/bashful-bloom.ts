import type { LegendCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const bashfulBloom: LegendCard = {
  cardNumber: 189,
  cardType: "legend",
  championTag: "Lillia",
  domain: ["calm", "mind"],
  id: createCardId("unl-189-219"),
  name: "Bashful Bloom",
  rarity: "rare",
  rulesText:
    "[4], [Exhaust]: Play a ready 3 [Might] Sprite unit token with [Temporary]. This ability costs [1] less for each friendly unit with [Temporary].",
  setId: "UNL",
};
