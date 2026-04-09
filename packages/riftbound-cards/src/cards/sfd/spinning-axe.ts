import type { EquipmentCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const spinningAxe: EquipmentCard = {
  cardNumber: 186,
  cardType: "equipment",
  domain: ["fury", "chaos"],
  energyCost: 2,
  id: createCardId("sfd-186-221"),
  mightBonus: 3,
  name: "Spinning Axe",
  rarity: "epic",
  rulesText:
    "[Quick-Draw] (This has [Reaction]. When you play it, attach it to a unit you control.)\n[Equip] [rainbow] ([rainbow]: Attach this to a unit you control.)\n[Temporary] (If this is unattached, kill it at the start of its controller's Beginning Phase, before scoring.)",
  setId: "SFD",
};
