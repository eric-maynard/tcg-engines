import type { EquipmentCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const forgefireCape: EquipmentCard = {
  cardNumber: 190,
  cardType: "equipment",
  domain: ["calm", "mind"],
  effectText: "When I attack or defend, deal 2 to all enemy units here.",
  energyCost: 4,
  id: createCardId("sfd-190-221"),
  mightBonus: 3,
  name: "Forgefire Cape",
  rarity: "epic",
  rulesText:
    "[Unique] (Your deck can have only 1 card with this name.)\n[Equip] [rainbow] ([rainbow]: Attach this to a unit you control.)\nWhen I attack or defend, deal 2 to all enemy units here.",
  setId: "SFD",
};
