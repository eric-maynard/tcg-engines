import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const lonelyPoro: UnitCard = {
  cardNumber: 221,
  cardType: "unit",
  domain: "calm",
  energyCost: 2,
  id: createCardId("unl-221-219"),
  might: 2,
  name: "Lonely Poro",
  rarity: "common",
  rulesText: "[Deathknell][&gt;] If I died alone, draw 1. (When I die, get the effect. I was alone if there were no other friendly units here.)",
  setId: "UNL",
};
