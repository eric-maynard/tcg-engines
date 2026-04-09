import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const inviolusVox: UnitCard = {
  cardNumber: 27,
  cardType: "unit",
  domain: "fury",
  energyCost: 8,
  id: createCardId("unl-027-219"),
  might: 8,
  name: "Inviolus Vox",
  rarity: "epic",
  rulesText: "When I conquer, give a friendly unit +8 [Might] this turn.",
  setId: "UNL",
};
