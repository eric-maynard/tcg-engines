import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const vayneHunter: UnitCard = {
  cardNumber: 35,
  cardType: "unit",
  domain: "fury",
  energyCost: 4,
  id: createCardId("ogn-035-298"),
  isChampion: true,
  might: 2,
  name: "Vayne, Hunter",
  rarity: "rare",
  rulesText:
    "[Assault 3] (+3 [Might] while I'm an attacker.)\nIf an opponent controls a battlefield, I enter ready.\nWhen I conquer, you may pay [1] to return me to my owner's hand.",
  setId: "OGN",
  tags: ["Vayne"],
};
