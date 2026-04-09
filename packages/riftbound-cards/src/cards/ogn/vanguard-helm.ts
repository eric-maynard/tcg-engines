import type { GearCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const vanguardHelm: GearCard = {
  cardNumber: 228,
  cardType: "gear",
  domain: "order",
  energyCost: 2,
  id: createCardId("ogn-228-298"),
  name: "Vanguard Helm",
  rarity: "uncommon",
  rulesText:
    "When a buffed friendly unit dies, buff another friendly unit. (If it doesn't have a buff, it gets a +1 [Might] buff.)",
  setId: "OGN",
};
