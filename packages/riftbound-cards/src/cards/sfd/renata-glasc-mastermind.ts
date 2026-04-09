import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const renataGlascMastermind: UnitCard = {
  cardNumber: 88,
  cardType: "unit",
  domain: "mind",
  energyCost: 5,
  id: createCardId("sfd-088-221"),
  isChampion: true,
  might: 4,
  name: "Renata Glasc, Mastermind",
  rarity: "epic",
  rulesText:
    "[1][mind]: Draw 1.\n[4][mind][mind][mind][mind], [Exhaust]: Score 1 point.\nUse my abilities only while I'm at a battlefield.",
  setId: "SFD",
  tags: ["Renata Glasc"],
};
