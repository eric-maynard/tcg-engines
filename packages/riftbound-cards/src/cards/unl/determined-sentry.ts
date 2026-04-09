import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const determinedSentry: UnitCard = {
  cardNumber: 111,
  cardType: "unit",
  domain: "body",
  energyCost: 1,
  id: createCardId("unl-111-219"),
  might: 1,
  name: "Determined Sentry",
  rarity: "rare",
  rulesText: "I can't move to base.",
  setId: "UNL",
};
