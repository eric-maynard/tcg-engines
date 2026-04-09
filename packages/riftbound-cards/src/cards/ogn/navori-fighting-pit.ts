import type { BattlefieldCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const navoriFightingPit: BattlefieldCard = {
  cardNumber: 283,
  cardType: "battlefield",
  id: createCardId("ogn-283-298"),
  name: "Navori Fighting Pit",
  rarity: "uncommon",
  rulesText:
    "When you hold here, buff a unit here. (If it doesn't have a buff, it gets a +1 [Might] buff.)",
  setId: "OGN",
};
