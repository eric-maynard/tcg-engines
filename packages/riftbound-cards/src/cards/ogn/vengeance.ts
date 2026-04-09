import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const vengeance: SpellCard = {
  cardNumber: 229,
  cardType: "spell",
  domain: "order",
  energyCost: 4,
  id: createCardId("ogn-229-298"),
  name: "Vengeance",
  rarity: "uncommon",
  rulesText: "Kill a unit.",
  setId: "OGN",
  timing: "action",
};
