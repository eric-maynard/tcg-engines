import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const meditation: SpellCard = {
  cardNumber: 48,
  cardType: "spell",
  domain: "calm",
  energyCost: 2,
  id: createCardId("ogn-048-298"),
  name: "Meditation",
  rarity: "common",
  rulesText:
    "[Reaction] (Play any time, even before spells and abilities resolve.)\nAs an additional cost to play this, you may exhaust a friendly unit. If you do, draw 2. Otherwise, draw 1.",
  setId: "OGN",
  timing: "reaction",
};
