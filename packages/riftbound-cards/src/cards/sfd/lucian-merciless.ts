import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const lucianMerciless: UnitCard = {
  cardNumber: 113,
  cardType: "unit",
  domain: "body",
  energyCost: 3,
  id: createCardId("sfd-113-221"),
  isChampion: true,
  might: 3,
  name: "Lucian, Merciless",
  rarity: "rare",
  rulesText:
    "[Weaponmaster] (When you play me, you may [Equip] one of your Equipment to me for [rainbow] less, even if it's already attached.)\nThe first time I conquer each turn, ready me.",
  setId: "SFD",
  tags: ["Lucian"],
};
