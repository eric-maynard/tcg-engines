import type { EquipmentCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const theZeroDrive: EquipmentCard = {
  cardNumber: 90,
  cardType: "equipment",
  domain: "mind",
  energyCost: 3,
  id: createCardId("sfd-090-221"),
  mightBonus: 2,
  name: "The Zero Drive",
  rarity: "epic",
  rulesText:
    "[Equip] [1][mind] ([1][mind]: Attach this to a unit you control.)\n[3][mind], Banish this: Play all units banished with this, ignoring their costs. (Use only if unattached.)",
  setId: "SFD",
};
