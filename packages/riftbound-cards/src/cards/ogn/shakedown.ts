import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const shakedown: SpellCard = {
  cardNumber: 33,
  cardType: "spell",
  domain: "fury",
  energyCost: 2,
  id: createCardId("ogn-033-298"),
  name: "Shakedown",
  rarity: "rare",
  rulesText:
    "[Reaction] (Play any time, even before spells and abilities resolve.)\nChoose an enemy unit. Deal 6 to it unless its controller has you draw 2.",
  setId: "OGN",
  timing: "reaction",
};
