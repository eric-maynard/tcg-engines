import type { EquipmentCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const experimentalHexplate: EquipmentCard = {
  cardNumber: 73,
  cardType: "equipment",
  domain: "mind",
  effectText: "I am a Mech.",
  energyCost: 1,
  id: createCardId("sfd-073-221"),
  mightBonus: 1,
  name: "Experimental Hexplate",
  rarity: "uncommon",
  rulesText: "[Equip] [mind] ([mind]: Attach this to a unit you control.)\nI am a Mech.",
  setId: "SFD",
};
