import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const syndraTranscendent: UnitCard = {
  cardNumber: 146,
  cardType: "unit",
  domain: "chaos",
  energyCost: 6,
  id: createCardId("unl-146-219"),
  isChampion: true,
  might: 6,
  name: "Syndra, Transcendent",
  rarity: "rare",
  rulesText:
    "While I'm in a showdown, your spells have [Repeat] [2][chaos]. (You may pay the additional cost to repeat the spell's effect.)",
  setId: "UNL",
  tags: ["Syndra"],
};
