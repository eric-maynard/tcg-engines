import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const buhruCaptain: UnitCard = {
  cardNumber: 91,
  cardType: "unit",
  domain: "body",
  energyCost: 3,
  id: createCardId("sfd-091-221"),
  might: 3,
  name: "Buhru Captain",
  rarity: "common",
  rulesText:
    "When you play me, you may draw 1 or buff me. (To buff a unit, give it a +1 [Might] buff if it doesn't already have one.)",
  setId: "SFD",
};
