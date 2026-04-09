import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const masterYiTempered: UnitCard = {
  cardNumber: 113,
  cardType: "unit",
  domain: "body",
  energyCost: 4,
  id: createCardId("unl-113-219"),
  isChampion: true,
  might: 4,
  name: "Master Yi, Tempered",
  rarity: "rare",
  rulesText:
    "[Hunt 2] (When I conquer or hold, gain 2 XP.)\n[Level 6][&gt;] I have [Deflect] and [Ganking]. (While you have 6+ XP, opponents must pay [rainbow] to choose me with a spell or ability and I can move from battlefield to battlefield.)",
  setId: "UNL",
  tags: ["Master Yi"],
};
