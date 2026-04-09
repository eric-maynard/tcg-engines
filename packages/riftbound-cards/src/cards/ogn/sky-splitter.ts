import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const skySplitter: SpellCard = {
  cardNumber: 14,
  cardType: "spell",
  domain: "fury",
  energyCost: 8,
  id: createCardId("ogn-014-298"),
  name: "Sky Splitter",
  rarity: "common",
  rulesText:
    "[Action] (Play on your turn or in showdowns.)\nThis spell's Energy cost is reduced by the highest Might among units you control.\nDeal 5 to a unit at a battlefield.",
  setId: "OGN",
  timing: "action",
};
