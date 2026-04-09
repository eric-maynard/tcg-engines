import type { EquipmentCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const lastRites: EquipmentCard = {
  cardNumber: 150,
  cardType: "equipment",
  domain: "chaos",
  energyCost: 3,
  id: createCardId("sfd-150-221"),
  mightBonus: 2,
  name: "Last Rites",
  rarity: "epic",
  rulesText:
    "[Equip] — [chaos], Recycle 2 cards from your trash (Pay the cost: Attach this to a unit you control.)",
  setId: "SFD",
};
