import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const enthusiasticPromoter: UnitCard = {
  cardNumber: 43,
  cardType: "unit",
  domain: "calm",
  energyCost: 3,
  id: createCardId("unl-043-219"),
  might: 2,
  name: "Enthusiastic Promoter",
  rarity: "uncommon",
  rulesText:
    "[Backline] (I must be assigned combat damage last.)\nWhen I hold, [Buff] all units here. (Give each a +1 [Might] buff if it doesn't have one.)",
  setId: "UNL",
};
