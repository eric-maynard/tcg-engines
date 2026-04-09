import type { EquipmentCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const hextechGauntlets: EquipmentCard = {
  cardNumber: 188,
  cardType: "equipment",
  domain: ["fury", "order"],
  energyCost: 3,
  id: createCardId("unl-188-219"),
  mightBonus: 3,
  name: "Hextech Gauntlets",
  rarity: "epic",
  rulesText:
    "[Equip] [3][rainbow]. This ability's Energy cost is reduced by the Might of the unit you choose. (Pay the cost: Attach this to a unit you control.)",
  setId: "UNL",
};
