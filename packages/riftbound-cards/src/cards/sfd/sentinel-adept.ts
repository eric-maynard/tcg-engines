import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const sentinelAdept: UnitCard = {
  cardNumber: 8,
  cardType: "unit",
  domain: "fury",
  energyCost: 3,
  id: createCardId("sfd-008-221"),
  might: 3,
  name: "Sentinel Adept",
  rarity: "common",
  rulesText:
    "[Weaponmaster] (When you play me, you may [Equip] one of your Equipment to me for [rainbow] less, even if it's already attached.)",
  setId: "SFD",
};
