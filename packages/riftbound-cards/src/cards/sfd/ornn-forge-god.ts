import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const ornnForgeGod: UnitCard = {
  cardNumber: 85,
  cardType: "unit",
  domain: "mind",
  energyCost: 6,
  id: createCardId("sfd-085-221"),
  isChampion: true,
  might: 4,
  name: "Ornn, Forge God",
  rarity: "rare",
  rulesText:
    "[Deflect 2] (Opponents must pay [rainbow][rainbow] to choose me with a spell or ability.)\n[Weaponmaster] (When you play me, you may [Equip] one of your Equipment to me for [rainbow] less, even if it's already attached.)\nI have +1 [Might] for each friendly gear.",
  setId: "SFD",
  tags: ["Ornn"],
};
