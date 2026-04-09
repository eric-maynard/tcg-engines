import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const ekkoRecurrent: UnitCard = {
  cardNumber: 110,
  cardType: "unit",
  domain: "mind",
  energyCost: 5,
  id: createCardId("ogn-110-298"),
  isChampion: true,
  might: 5,
  name: "Ekko, Recurrent",
  rarity: "rare",
  rulesText:
    "[Accelerate] (You may pay [1][mind] as an additional cost to have me enter ready.)\n[Deathknell] — Recycle me to ready your runes. (When I die, get the effect.)",
  setId: "OGN",
  tags: ["Ekko"],
};
