import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const ancientWarmonger: UnitCard = {
  cardNumber: 131,
  cardType: "unit",
  domain: "chaos",
  energyCost: 5,
  id: createCardId("sfd-131-221"),
  might: 4,
  name: "Ancient Warmonger",
  rarity: "uncommon",
  rulesText:
    "[Accelerate] (You may pay [1][chaos] as an additional cost to have me enter ready.)\nI have [Assault] equal to the number of enemy units here. (+1 [Might] while I'm an attacker for each instance of Assault.)",
  setId: "SFD",
};
