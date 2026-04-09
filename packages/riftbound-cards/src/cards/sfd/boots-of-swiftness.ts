import type { EquipmentCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const bootsOfSwiftness: EquipmentCard = {
  cardNumber: 133,
  cardType: "equipment",
  domain: "chaos",
  energyCost: 3,
  id: createCardId("sfd-133-221"),
  mightBonus: 2,
  name: "Boots of Swiftness",
  rarity: "uncommon",
  rulesText: "[Equip] [chaos] ([chaos]: Attach this to a unit you control.)",
  setId: "SFD",
};
