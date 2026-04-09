import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const jhinMeticulousKiller: UnitCard = {
  cardNumber: 89,
  cardType: "unit",
  domain: "mind",
  energyCost: 4,
  id: createCardId("unl-089-219"),
  isChampion: true,
  might: 4,
  name: "Jhin, Meticulous Killer",
  rarity: "epic",
  rulesText:
    "[Vision] (When you play me, look at the top card of your Main Deck. You may recycle it.)\nIf you've spent [4] or more to play a spell this turn, you may play me for [mind].",
  setId: "UNL",
  tags: ["Jhin"],
};
