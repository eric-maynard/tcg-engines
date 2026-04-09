import type { EquipmentCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const clothArmor: EquipmentCard = {
  cardNumber: 64,
  cardType: "equipment",
  domain: "mind",
  energyCost: 1,
  id: createCardId("sfd-064-221"),
  mightBonus: 0,
  name: "Cloth Armor",
  rarity: "common",
  rulesText:
    "[Quick-Draw] (This has [Reaction]. When you play it, attach it to a unit you control.)\n[Equip] [mind] ([mind]: Attach this to a unit you control.)",
  setId: "SFD",
};
