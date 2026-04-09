import type { EquipmentCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const shepherdsHeirloom: EquipmentCard = {
  cardNumber: 158,
  cardType: "equipment",
  domain: "order",
  energyCost: 2,
  id: createCardId("unl-158-219"),
  mightBonus: 2,
  name: "Shepherd's Heirloom",
  rarity: "common",
  rulesText:
    "When you play this, gain 1 XP.\n[Equip] — Spend 1 XP (Pay the cost: Attach this to a unit you control.)",
  setId: "UNL",
};
