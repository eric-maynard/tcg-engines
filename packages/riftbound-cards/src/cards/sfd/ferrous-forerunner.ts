import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const ferrousForerunner: UnitCard = {
  cardNumber: 21,
  cardType: "unit",
  domain: "fury",
  energyCost: 6,
  id: createCardId("sfd-021-221"),
  might: 6,
  name: "Ferrous Forerunner",
  rarity: "rare",
  rulesText:
    "[Deathknell] — Play two 3 [Might] Mech unit tokens to your base. (When I die, get the effect.)",
  setId: "SFD",
};
