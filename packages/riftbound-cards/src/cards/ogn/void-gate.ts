import type { BattlefieldCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const voidGate: BattlefieldCard = {
  cardNumber: 296,
  cardType: "battlefield",
  id: createCardId("ogn-296-298"),
  name: "Void Gate",
  rarity: "uncommon",
  rulesText:
    "Spells and abilities deal 1 Bonus Damage to units here. (Each instance of damage the spell deals to a unit here is increased by 1.)",
  setId: "OGN",
};
