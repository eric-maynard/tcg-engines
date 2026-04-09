import type { EquipmentCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const cull: EquipmentCard = {
  cardNumber: 134,
  cardType: "equipment",
  domain: "chaos",
  energyCost: 1,
  id: createCardId("sfd-134-221"),
  mightBonus: 1,
  name: "Cull",
  rarity: "uncommon",
  rulesText: "[Equip] [chaos] ([chaos]: Attach this to a unit you control.)",
  setId: "SFD",
};
