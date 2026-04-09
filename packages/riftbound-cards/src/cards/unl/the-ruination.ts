import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const theRuination: SpellCard = {
  cardNumber: 180,
  cardType: "spell",
  domain: "order",
  energyCost: 9,
  id: createCardId("unl-180-219"),
  name: "The Ruination",
  rarity: "epic",
  rulesText: "Kill all units.",
  setId: "UNL",
  timing: "action",
};
