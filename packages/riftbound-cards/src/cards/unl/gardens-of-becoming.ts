import type { BattlefieldCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const gardensOfBecoming: BattlefieldCard = {
  cardNumber: 213,
  cardType: "battlefield",
  id: createCardId("unl-213-219"),
  name: "Gardens of Becoming",
  rarity: "uncommon",
  rulesText: "Units here have &quot;[Exhaust]: Gain 1 XP.&quot;",
  setId: "UNL",
};
