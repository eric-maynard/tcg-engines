import type { EquipmentCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const bladeOfTheRuinedKing: EquipmentCard = {
  cardNumber: 178,
  cardType: "equipment",
  domain: "order",
  energyCost: 3,
  id: createCardId("sfd-178-221"),
  mightBonus: 4,
  name: "Blade of the Ruined King",
  rarity: "epic",
  rulesText:
    "[Equip] — [order], Kill a friendly unit (Pay the cost: Attach this to a unit you control.)",
  setId: "SFD",
};
