import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const gearhead: UnitCard = {
  cardNumber: 68,
  cardType: "unit",
  domain: "mind",
  energyCost: 5,
  id: createCardId("sfd-068-221"),
  might: 3,
  name: "Gearhead",
  rarity: "common",
  rulesText:
    "[Accelerate] (You may pay [1][mind] as an additional cost to have me enter ready.)\nEach Equipment attached to me gives double its base Might bonus.",
  setId: "SFD",
};
