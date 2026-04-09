import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const retreat: SpellCard = {
  cardNumber: 104,
  cardType: "spell",
  domain: "mind",
  energyCost: 1,
  id: createCardId("ogn-104-298"),
  name: "Retreat",
  rarity: "uncommon",
  rulesText:
    "[Reaction] (Play any time, even before spells and abilities resolve.)\nReturn a friendly unit to its owner's hand. Its owner channels 1 rune exhausted.",
  setId: "OGN",
  timing: "reaction",
};
