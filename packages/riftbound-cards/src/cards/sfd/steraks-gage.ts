import type { EquipmentCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const steraksGage: EquipmentCard = {
  cardNumber: 56,
  cardType: "equipment",
  domain: "calm",
  energyCost: 3,
  id: createCardId("sfd-056-221"),
  mightBonus: 3,
  name: "Sterak's Gage",
  rarity: "rare",
  rulesText:
    "[Quick-Draw] (This has [Reaction]. When you play it, attach it to a unit you control.)\n[Equip] [calm] ([calm]: Attach this to a unit you control.)",
  setId: "SFD",
};
