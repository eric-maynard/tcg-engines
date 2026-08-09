import type { EquipmentCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const serratedDirk: EquipmentCard = {
  cardNumber: 9,
  cardType: "equipment",
  domain: "fury",
  effectText: "[Assault 2] (+2 [Might] while I'm an attacker.)",
  energyCost: 1,
  id: createCardId("sfd-009-221"),
  mightBonus: 0,
  name: "Serrated Dirk",
  rarity: "common",
  rulesText:
    "[Equip] [fury] ([fury]: Attach this to a unit you control.)\n[Assault 2] (+2 [Might] while I'm an attacker.)",
  setId: "SFD",
};
