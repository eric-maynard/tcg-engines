import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const unyieldingSpirit: SpellCard = {
  cardNumber: 145,
  cardType: "spell",
  domain: "body",
  energyCost: 1,
  id: createCardId("ogn-145-298"),
  name: "Unyielding Spirit",
  rarity: "uncommon",
  rulesText:
    "[Reaction] (Play any time, even before spells and abilities resolve.)\nPrevent all spell and ability damage this turn.",
  setId: "OGN",
  timing: "reaction",
};
