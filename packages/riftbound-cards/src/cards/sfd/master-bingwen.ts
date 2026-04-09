import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const masterBingwen: UnitCard = {
  cardNumber: 127,
  cardType: "unit",
  domain: "chaos",
  energyCost: 6,
  id: createCardId("sfd-127-221"),
  might: 6,
  name: "Master Bingwen",
  rarity: "common",
  rulesText:
    "[Weaponmaster] (When you play me, you may [Equip] one of your Equipment to me for [rainbow] less, even if it's already attached.)",
  setId: "SFD",
};
