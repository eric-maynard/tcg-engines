import type { EquipmentCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const warmogsArmor: EquipmentCard = {
  cardNumber: 108,
  cardType: "equipment",
  domain: "body",
  energyCost: 1,
  id: createCardId("sfd-108-221"),
  mightBonus: 1,
  name: "Warmog's Armor",
  rarity: "uncommon",
  rulesText: "[Equip] [body] ([body]: Attach this to a unit you control.)",
  setId: "SFD",
};
