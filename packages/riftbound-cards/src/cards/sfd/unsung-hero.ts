import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const unsungHero: UnitCard = {
  cardNumber: 167,
  cardType: "unit",
  domain: "order",
  energyCost: 2,
  id: createCardId("sfd-167-221"),
  might: 2,
  name: "Unsung Hero",
  rarity: "uncommon",
  rulesText:
    "[Deathknell] — If I was [Mighty], draw 2. (When I die, get the effect. I'm Mighty while I have 5+ [Might].)",
  setId: "SFD",
};
