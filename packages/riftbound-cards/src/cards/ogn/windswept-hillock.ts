import type { BattlefieldCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const windsweptHillock: BattlefieldCard = {
  cardNumber: 297,
  cardType: "battlefield",
  id: createCardId("ogn-297-298"),
  name: "Windswept Hillock",
  rarity: "uncommon",
  rulesText: "Units here have [Ganking]. (They can move from battlefield to battlefield.)",
  setId: "OGN",
};
