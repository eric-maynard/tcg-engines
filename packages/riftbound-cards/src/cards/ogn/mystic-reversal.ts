import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const mysticReversal: SpellCard = {
  cardNumber: 80,
  cardType: "spell",
  domain: "calm",
  energyCost: 4,
  id: createCardId("ogn-080-298"),
  name: "Mystic Reversal",
  rarity: "epic",
  rulesText:
    "[Reaction] (Play any time, even before spells and abilities resolve.)\nGain control of a spell. You may make new choices for it.",
  setId: "OGN",
  timing: "reaction",
};
