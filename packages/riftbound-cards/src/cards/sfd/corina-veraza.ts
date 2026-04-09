import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const corinaVeraza: UnitCard = {
  cardNumber: 179,
  cardType: "unit",
  domain: "order",
  energyCost: 7,
  id: createCardId("sfd-179-221"),
  might: 6,
  name: "Corina Veraza",
  rarity: "epic",
  rulesText:
    "[Accelerate] (You may pay [1][order] as an additional cost to have me enter ready.)\nWhen I move to a battlefield, play three 1 [Might] Recruit unit tokens here.",
  setId: "SFD",
};
