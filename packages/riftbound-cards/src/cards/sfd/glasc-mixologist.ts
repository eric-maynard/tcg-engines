import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const glascMixologist: UnitCard = {
  cardNumber: 165,
  cardType: "unit",
  domain: "order",
  energyCost: 5,
  id: createCardId("sfd-165-221"),
  might: 5,
  name: "Glasc Mixologist",
  rarity: "uncommon",
  rulesText:
    "[Deathknell] — You may play a unit with cost no more than [3] and no more than [rainbow] from your trash, ignoring its cost. (When I die, get the effect.)",
  setId: "SFD",
};
