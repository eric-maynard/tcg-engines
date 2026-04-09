import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const lunarBoon: SpellCard = {
  cardNumber: 125,
  cardType: "spell",
  domain: "chaos",
  energyCost: 3,
  id: createCardId("unl-125-219"),
  name: "Lunar Boon",
  rarity: "common",
  rulesText:
    "[Reaction] (Play any time, even before spells and abilities resolve.)\nDiscard 1, then draw 2.",
  setId: "UNL",
  timing: "reaction",
};
