import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const rengarTrophyHunter: UnitCard = {
  cardNumber: 120,
  cardType: "unit",
  domain: "body",
  energyCost: 5,
  id: createCardId("unl-120-219"),
  isChampion: true,
  might: 6,
  name: "Rengar, Trophy Hunter",
  rarity: "epic",
  rulesText:
    "[Ambush] (You may play me as a [Reaction] to a battlefield where you have units.)\nI can be played to a battlefield where there are enemy units (even if you don't have units there).",
  setId: "UNL",
  tags: ["Rengar"],
};
