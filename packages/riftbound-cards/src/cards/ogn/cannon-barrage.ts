import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const cannonBarrage: SpellCard = {
  cardNumber: 127,
  cardType: "spell",
  domain: "body",
  energyCost: 2,
  id: createCardId("ogn-127-298"),
  name: "Cannon Barrage",
  rarity: "common",
  rulesText:
    "[Reaction] (Play any time, even before spells and abilities resolve.)\nDeal 2 to all enemy units in combat.",
  setId: "OGN",
  timing: "reaction",
};
