import type { EquipmentCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const longSword: EquipmentCard = {
  cardNumber: 22,
  cardType: "equipment",
  domain: "fury",
  energyCost: 2,
  id: createCardId("sfd-022-221"),
  mightBonus: 2,
  name: "Long Sword",
  rarity: "rare",
  rulesText:
    "[Quick-Draw] (This has [Reaction]. When you play it, attach it to a unit you control.)\n[Equip] [fury] ([fury]: Attach this to a unit you control.)",
  setId: "SFD",
};
