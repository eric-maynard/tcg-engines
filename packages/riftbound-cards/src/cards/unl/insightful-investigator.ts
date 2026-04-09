import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const insightfulInvestigator: UnitCard = {
  cardNumber: 135,
  cardType: "unit",
  domain: "chaos",
  energyCost: 3,
  id: createCardId("unl-135-219"),
  might: 3,
  name: "Insightful Investigator",
  rarity: "uncommon",
  rulesText:
    "When you play me, choose an opponent. They reveal their hand. You may pay 2 XP to choose a card from their hand. If you do, they discard that card and draw 1.",
  setId: "UNL",
};
