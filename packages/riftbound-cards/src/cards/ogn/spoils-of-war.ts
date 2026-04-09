import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const spoilsOfWar: SpellCard = {
  cardNumber: 144,
  cardType: "spell",
  domain: "body",
  energyCost: 4,
  id: createCardId("ogn-144-298"),
  name: "Spoils of War",
  rarity: "uncommon",
  rulesText:
    "[Reaction] (Play any time, even before spells and abilities resolve.)\nIf an enemy unit has died this turn, this costs [2] less.\nDraw 2.",
  setId: "OGN",
  timing: "reaction",
};
