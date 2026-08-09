import type { EquipmentCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const sacredShears: EquipmentCard = {
  cardNumber: 172,
  cardType: "equipment",
  domain: "order",
  effectText: "[Deathknell] — Draw 1. (When I die, get the effect.)",
  energyCost: 2,
  id: createCardId("sfd-172-221"),
  mightBonus: 1,
  name: "Sacred Shears",
  rarity: "rare",
  rulesText:
    "[Equip] [order] ([order]: Attach this to a unit you control.)\n[Deathknell] — Draw 1. (When I die, get the effect.)",
  setId: "SFD",
};
