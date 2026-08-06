import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const veteranPoro: UnitCard = {
  cardNumber: 99,
  cardType: "unit",
  domain: "body",
  energyCost: 2,
  id: createCardId("sfd-099-221"),
  might: 2,
  name: "Veteran Poro",
  rarity: "common",
  rulesText:
    "[Weaponmaster] (When you play me, you may [Equip] one of your Equipment to me for [rainbow] less, even if it's already attached.)",
  setId: "SFD",
  tags: ["Poro"], // rule-id: unl-046-219 — printed PORO tag (missing from set data)
};
