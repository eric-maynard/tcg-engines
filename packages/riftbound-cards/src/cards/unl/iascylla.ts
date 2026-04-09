import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const iascylla: UnitCard = {
  cardNumber: 50,
  cardType: "unit",
  domain: "calm",
  energyCost: 7,
  id: createCardId("unl-050-219"),
  might: 6,
  name: "Iascylla",
  rarity: "rare",
  rulesText:
    "When I hold, at the start of your next Main Phase, you may move an enemy unit to this battlefield.",
  setId: "UNL",
};
