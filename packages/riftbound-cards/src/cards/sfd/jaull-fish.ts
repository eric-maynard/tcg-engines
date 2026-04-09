import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const jaullFish: UnitCard = {
  cardNumber: 103,
  cardType: "unit",
  domain: "body",
  energyCost: 7,
  id: createCardId("sfd-103-221"),
  might: 6,
  name: "Jaull-Fish",
  rarity: "uncommon",
  rulesText:
    "[Accelerate] (You may pay [1][body] as an additional cost to have me enter ready.)\nI cost [2] less for each of your [Mighty] units. (A unit is Mighty while it has 5+ [Might].)",
  setId: "SFD",
};
