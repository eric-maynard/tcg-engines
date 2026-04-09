import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const crescentGuardian: UnitCard = {
  cardNumber: 122,
  cardType: "unit",
  domain: "chaos",
  energyCost: 4,
  id: createCardId("unl-122-219"),
  might: 4,
  name: "Crescent Guardian",
  rarity: "common",
  rulesText:
    "If you've played a spell this turn, you may pay [chaos] as an additional cost to play me. If you do, I enter ready.",
  setId: "UNL",
};
