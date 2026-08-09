import type { EquipmentCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const soulSword: EquipmentCard = {
  cardNumber: 39,
  cardType: "equipment",
  domain: "calm",
  effectText:
    "[Level 3][>] I have an additional +1 [Might]. (While you have 3+ XP, get the effect.)",
  energyCost: 1,
  id: createCardId("unl-039-219"),
  mightBonus: 1,
  name: "Soul Sword",
  rarity: "common",
  rulesText:
    "[Equip] [calm] ([calm]: Attach this to a unit you control.)\n[Level 3][>] I have an additional +1 [Might]. (While you have 3+ XP, get the effect.)",
  setId: "UNL",
};
