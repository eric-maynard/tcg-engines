import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const flurryOfBlades: SpellCard = {
  cardNumber: 133,
  cardType: "spell",
  domain: "body",
  energyCost: 1,
  id: createCardId("ogn-133-298"),
  name: "Flurry of Blades",
  rarity: "common",
  rulesText:
    "[Reaction] (Play any time, even before spells and abilities resolve.)\nDeal 1 to all units at battlefields.",
  setId: "OGN",
  timing: "reaction",
};
