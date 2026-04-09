import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const riftHerald: UnitCard = {
  cardNumber: 179,
  cardType: "unit",
  domain: "order",
  energyCost: 8,
  id: createCardId("unl-179-219"),
  might: 7,
  name: "Rift Herald",
  rarity: "epic",
  rulesText:
    "When I move to a battlefield, look at the top 3 cards of your Main Deck. You may reveal a unit from among them and draw it. Recycle the rest.\n[Deathknell][&gt;] Play a unit from your hand to your base, ignoring its Energy cost. (When I die, get the effect. You must still pay its Power cost.)",
  setId: "UNL",
};
