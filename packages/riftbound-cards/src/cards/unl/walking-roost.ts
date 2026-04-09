import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const walkingRoost: UnitCard = {
  cardNumber: 130,
  cardType: "unit",
  domain: "chaos",
  energyCost: 5,
  id: createCardId("unl-130-219"),
  might: 6,
  name: "Walking Roost",
  rarity: "common",
  rulesText:
    "[Deflect] (Opponents must pay [rainbow] to choose me with a spell or ability.)\nWhen you play me, choose an opponent. They play a 1 [Might] Bird unit token with [Deflect].",
  setId: "UNL",
};
