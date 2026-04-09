import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const arachnoidHorror: UnitCard = {
  cardNumber: 117,
  cardType: "unit",
  domain: "body",
  energyCost: 6,
  id: createCardId("unl-117-219"),
  might: 6,
  name: "Arachnoid Horror",
  rarity: "epic",
  rulesText:
    "[Hunt 2] (When I conquer or hold, gain 2 XP.)\nI can be played to an occupied battlefield if an enemy unit is alone there.\nFriendly units can be played to an occupied battlefield if an enemy unit is alone there.",
  setId: "UNL",
};
