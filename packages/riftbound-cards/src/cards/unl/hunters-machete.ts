import type { EquipmentCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const huntersMachete: EquipmentCard = {
  cardNumber: 96,
  cardType: "equipment",
  domain: "body",
  effectText: "[Hunt] (When I conquer or hold, gain 1 XP.)",
  energyCost: 3,
  id: createCardId("unl-096-219"),
  mightBonus: 2,
  name: "Hunter's Machete",
  rarity: "common",
  rulesText:
    "[Equip] [body] ([body]: Attach this to a unit you control.)\n[Hunt] (When I conquer or hold, gain 1 XP.)",
  setId: "UNL",
};
