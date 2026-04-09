import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const enGarde: SpellCard = {
  cardNumber: 46,
  cardType: "spell",
  domain: "calm",
  energyCost: 1,
  id: createCardId("ogn-046-298"),
  name: "En Garde",
  rarity: "common",
  rulesText:
    "[Reaction] (Play any time, even before spells and abilities resolve.)\nGive a friendly unit +1 [Might] this turn, then an additional +1 [Might] this turn if it is the only unit you control there.",
  setId: "OGN",
  timing: "reaction",
};
