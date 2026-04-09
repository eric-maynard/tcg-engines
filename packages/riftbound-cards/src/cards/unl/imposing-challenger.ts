import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const imposingChallenger: UnitCard = {
  cardNumber: 105,
  cardType: "unit",
  domain: "body",
  energyCost: 5,
  id: createCardId("unl-105-219"),
  might: 5,
  name: "Imposing Challenger",
  rarity: "uncommon",
  rulesText:
    "When I move, you may move an enemy unit here with less Might than me to a different battlefield.",
  setId: "UNL",
};
