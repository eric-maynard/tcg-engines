import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const combatChef: UnitCard = {
  cardNumber: 92,
  cardType: "unit",
  domain: "body",
  energyCost: 5,
  id: createCardId("sfd-092-221"),
  might: 5,
  name: "Combat Chef",
  rarity: "common",
  rulesText:
    "[Weaponmaster] (When you play me, you may [Equip] one of your Equipment to me for [rainbow] less, even if it's already attached.)",
  setId: "SFD",
};
