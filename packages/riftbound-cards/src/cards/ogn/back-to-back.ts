import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const backToBack: SpellCard = {
  cardNumber: 206,
  cardType: "spell",
  domain: "order",
  energyCost: 3,
  id: createCardId("ogn-206-298"),
  name: "Back to Back",
  rarity: "common",
  rulesText:
    "[Reaction] (Play any time, even before spells and abilities resolve.)\nGive two friendly units each +2 [Might] this turn.",
  setId: "OGN",
  timing: "reaction",
};
