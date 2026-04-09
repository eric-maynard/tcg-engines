import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const lonelyPoro: UnitCard = {
  cardNumber: 36,
  cardType: "unit",
  domain: "calm",
  energyCost: 2,
  id: createCardId("sfd-036-221"),
  might: 2,
  name: "Lonely Poro",
  rarity: "common",
  rulesText:
    "[Deathknell] — If I died alone, draw 1. (When I die, get the effect. I'm alone if there are no other friendly units here.)",
  setId: "SFD",
};
