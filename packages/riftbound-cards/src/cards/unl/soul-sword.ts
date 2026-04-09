import type { EquipmentCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const soulSword: EquipmentCard = {
  cardNumber: 39,
  cardType: "equipment",
  domain: "calm",
  energyCost: 1,
  id: createCardId("unl-039-219"),
  mightBonus: 1,
  name: "Soul Sword",
  rarity: "common",
  rulesText: "[Equip] [calm] ([calm]: Attach this to a unit you control.)",
  setId: "UNL",
};
