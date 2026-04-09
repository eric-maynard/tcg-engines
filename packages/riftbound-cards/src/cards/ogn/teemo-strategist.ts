import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const teemoStrategist: UnitCard = {
  cardNumber: 121,
  cardType: "unit",
  domain: "mind",
  energyCost: 2,
  id: createCardId("ogn-121-298"),
  isChampion: true,
  might: 2,
  name: "Teemo, Strategist",
  rarity: "epic",
  rulesText:
    "[Hidden] (Hide now for [rainbow] to react with later for [energy_0].)\nWhen I defend, choose an enemy unit here and reveal the top 5 cards of your Main Deck. Deal 1 to that unit for each card with [Hidden] revealed this way, then recycle the revealed cards.",
  setId: "OGN",
  tags: ["Teemo"],
};
