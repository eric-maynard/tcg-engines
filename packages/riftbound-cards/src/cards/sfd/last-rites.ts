import type { EquipmentCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const lastRites: EquipmentCard = {
  cardNumber: 150,
  cardType: "equipment",
  domain: "chaos",
  effectText:
    "When I conquer or hold, you may play a unit from your trash. (You still pay its costs.)",
  energyCost: 3,
  id: createCardId("sfd-150-221"),
  mightBonus: 2,
  name: "Last Rites",
  rarity: "epic",
  rulesText:
    "[Equip] — [chaos], Recycle 2 cards from your trash (Pay the cost: Attach this to a unit you control.)\nWhen I conquer or hold, you may play a unit from your trash. (You still pay its costs.)",
  setId: "SFD",
};
