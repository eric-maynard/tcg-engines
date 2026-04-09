import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const starCrossed: SpellCard = {
  cardNumber: 128,
  cardType: "spell",
  domain: "chaos",
  energyCost: 3,
  id: createCardId("unl-128-219"),
  name: "Star-Crossed",
  rarity: "common",
  rulesText:
    "[Reaction] (Play any time, even before spells and abilities resolve.)\nReturn a friendly unit and an enemy unit to their owners' hands.",
  setId: "UNL",
  timing: "reaction",
};
