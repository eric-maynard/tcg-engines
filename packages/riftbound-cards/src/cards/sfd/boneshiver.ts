import type { EquipmentCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const boneshiver: EquipmentCard = {
  cardNumber: 118,
  cardType: "equipment",
  domain: "body",
  effectText: "When I conquer, channel 1 rune exhausted.",
  energyCost: 3,
  id: createCardId("sfd-118-221"),
  mightBonus: 2,
  name: "Boneshiver",
  rarity: "epic",
  rulesText:
    "[Equip] [1][body] ([1][body]: Attach this to a unit you control.)\nWhen I conquer, channel 1 rune exhausted.",
  setId: "SFD",
};
