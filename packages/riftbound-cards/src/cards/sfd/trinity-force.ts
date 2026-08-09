import type { EquipmentCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const trinityForce: EquipmentCard = {
  cardNumber: 115,
  cardType: "equipment",
  domain: "body",
  effectText: "When I hold, score 1 point.",
  energyCost: 4,
  id: createCardId("sfd-115-221"),
  mightBonus: 2,
  name: "Trinity Force",
  rarity: "rare",
  rulesText:
    "[Equip] [body] ([body]: Attach this to a unit you control.)\nWhen I hold, score 1 point.",
  setId: "SFD",
};
