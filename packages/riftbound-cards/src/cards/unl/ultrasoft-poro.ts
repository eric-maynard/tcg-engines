import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const ultrasoftPoro: UnitCard = {
  cardNumber: 160,
  cardType: "unit",
  domain: "order",
  energyCost: 5,
  id: createCardId("unl-160-219"),
  might: 5,
  name: "Ultrasoft Poro",
  rarity: "common",
  rulesText:
    "[Exhaust]: Play two [1] [Might] Bird unit tokens with [Deflect]. Use this ability only while I'm at a battlefield. (Opponents must pay [rainbow] to choose a [Deflect] unit with a spell or ability.)",
  setId: "UNL",
};
