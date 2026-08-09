import type { EquipmentCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const shurelyasRequiem: EquipmentCard = {
  cardNumber: 192,
  cardType: "equipment",
  domain: ["calm", "mind"],
  effectText: "Your units here have [Ganking]. (We can move from battlefield to battlefield.)",
  energyCost: 4,
  id: createCardId("sfd-192-221"),
  mightBonus: 2,
  name: "Shurelya's Requiem",
  rarity: "epic",
  rulesText:
    "[Unique] (Your deck can have only 1 card with this name.)\n[Equip] [rainbow] ([rainbow]: Attach this to a unit you control.)\nWhen you play this, ready your units.\nYour units here have [Ganking]. (We can move from battlefield to battlefield.)",
  setId: "SFD",
};
