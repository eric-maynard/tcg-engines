import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const yoneBlademaster: UnitCard = {
  cardNumber: 116,
  cardType: "unit",
  domain: "body",
  energyCost: 5,
  id: createCardId("sfd-116-221"),
  isChampion: true,
  might: 5,
  name: "Yone, Blademaster",
  rarity: "rare",
  rulesText:
    "[Weaponmaster] (When you play me, you may [Equip] one of your Equipment to me for [rainbow] less, even if it's already attached.)\nWhen I conquer a battlefield that was uncontrolled, deal damage equal to my Might to an enemy unit in a base.",
  setId: "SFD",
  tags: ["Yone"],
};
