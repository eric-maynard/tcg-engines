import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const anglerBeast: UnitCard = {
  cardNumber: 132,
  cardType: "unit",
  domain: "chaos",
  energyCost: 5,
  id: createCardId("unl-132-219"),
  might: 5,
  name: "Angler Beast",
  rarity: "uncommon",
  rulesText: "When you play me, return all units with 2 [Might] or less to their owners' hands.",
  setId: "UNL",
};
