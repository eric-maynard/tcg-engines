import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const dragonsoulSage: UnitCard = {
  cardNumber: 93,
  cardType: "unit",
  domain: "body",
  energyCost: 2,
  id: createCardId("unl-093-219"),
  might: 1,
  name: "Dragonsoul Sage",
  rarity: "common",
  rulesText:
    "[Reaction][&gt;] [Exhaust]: [Add] [1]. (Abilities that add resources can't be reacted to.)",
  setId: "UNL",
};
