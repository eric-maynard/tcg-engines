import type { EquipmentCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const edgeOfNight: EquipmentCard = {
  cardNumber: 139,
  cardType: "equipment",
  domain: "chaos",
  energyCost: 3,
  id: createCardId("sfd-139-221"),
  mightBonus: 2,
  name: "Edge of Night",
  rarity: "rare",
  rulesText:
    "[Hidden] (Hide now for [rainbow] to react with later for [energy_0].)\nWhen you play this from face down, attach it to a unit you control (here).\n[Equip] [chaos] ([chaos]: Attach this to a unit you control.)",
  setId: "SFD",
};
