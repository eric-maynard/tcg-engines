import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const defy: SpellCard = {
  cardNumber: 45,
  cardType: "spell",
  domain: "calm",
  energyCost: 1,
  id: createCardId("ogn-045-298"),
  name: "Defy",
  rarity: "common",
  rulesText:
    "[Reaction] (Play any time, even before spells and abilities resolve.)\nCounter a spell that costs no more than [4] and no more than [rainbow].",
  setId: "OGN",
  timing: "reaction",
};
