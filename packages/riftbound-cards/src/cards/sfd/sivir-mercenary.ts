import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const sivirMercenary: UnitCard = {
  cardNumber: 143,
  cardType: "unit",
  domain: "chaos",
  energyCost: 4,
  id: createCardId("sfd-143-221"),
  isChampion: true,
  might: 4,
  name: "Sivir, Mercenary",
  rarity: "rare",
  rulesText:
    "[Accelerate] (You may pay [1][chaos] as an additional cost to have me enter ready.)\nIf you've spent at least [rainbow][rainbow] this turn, I have +2 [Might] and [Ganking]. (I can move from battlefield to battlefield.)",
  setId: "SFD",
  tags: ["Sivir"],
};
