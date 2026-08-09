import type { EquipmentCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const rabadonsDeathcrown: EquipmentCard = {
  cardNumber: 191,
  cardType: "equipment",
  domain: ["calm", "mind"],
  effectText: "Your spells and abilities deal 3 Bonus Damage (while this is attached).",
  energyCost: 4,
  id: createCardId("sfd-191-221"),
  mightBonus: 3,
  name: "Rabadon's Deathcrown",
  rarity: "epic",
  rulesText:
    "[Unique] (Your deck can have only 1 card with this name.)\n[Equip] [rainbow] ([rainbow]: Attach this to a unit you control.)\nYour spells and abilities deal 3 Bonus Damage (while this is attached).",
  setId: "SFD",
};
