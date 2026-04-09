import type { BattlefieldCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const fortifiedPosition: BattlefieldCard = {
  cardNumber: 279,
  cardType: "battlefield",
  id: createCardId("ogn-279-298"),
  name: "Fortified Position",
  rarity: "uncommon",
  rulesText:
    "When you defend here, choose a unit. It gains [Shield 2] this combat. (+2 [Might] while it's a defender.)",
  setId: "OGN",
};
