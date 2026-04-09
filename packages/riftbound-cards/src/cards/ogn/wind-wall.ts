import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const windWall: SpellCard = {
  cardNumber: 64,
  cardType: "spell",
  domain: "calm",
  energyCost: 3,
  id: createCardId("ogn-064-298"),
  name: "Wind Wall",
  rarity: "uncommon",
  rulesText:
    "[Reaction] (Play any time, even before spells and abilities resolve.)\nCounter a spell.",
  setId: "OGN",
  timing: "reaction",
};
