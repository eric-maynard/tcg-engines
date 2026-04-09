import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const gust: SpellCard = {
  cardNumber: 169,
  cardType: "spell",
  domain: "chaos",
  energyCost: 1,
  id: createCardId("ogn-169-298"),
  name: "Gust",
  rarity: "common",
  rulesText:
    "[Reaction] (Play any time, even before spells and abilities resolve.)\nReturn a unit at a battlefield with 3 [Might] or less to its owner's hand.",
  setId: "OGN",
  timing: "reaction",
};
