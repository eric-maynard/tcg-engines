import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const armedAssailant: UnitCard = {
  cardNumber: 2,
  cardType: "unit",
  domain: "fury",
  energyCost: 6,
  id: createCardId("sfd-002-221"),
  might: 6,
  name: "Armed Assailant",
  rarity: "common",
  rulesText:
    "[Accelerate] (You may pay [1][fury] as an additional cost to have me enter ready.)\n[Weaponmaster] (When you play me, you may [Equip] one of your Equipment to me for [rainbow] less, even if it's already attached.)",
  setId: "SFD",
};
