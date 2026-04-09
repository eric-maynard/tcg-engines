import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const callToGlory: SpellCard = {
  cardNumber: 207,
  cardType: "spell",
  domain: "order",
  energyCost: 3,
  id: createCardId("ogn-207-298"),
  name: "Call to Glory",
  rarity: "common",
  rulesText:
    "[Reaction] (Play any time, even before spells and abilities resolve.)\nAs you play this, you may spend a buff as an additional cost. If you do, ignore this spell's cost.\nGive a unit +3 [Might] this turn.",
  setId: "OGN",
  timing: "reaction",
};
