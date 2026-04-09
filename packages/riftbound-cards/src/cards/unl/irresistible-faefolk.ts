import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const irresistibleFaefolk: UnitCard = {
  cardNumber: 112,
  cardType: "unit",
  domain: "body",
  energyCost: 2,
  id: createCardId("unl-112-219"),
  might: 1,
  name: "Irresistible Faefolk",
  rarity: "rare",
  rulesText: "When I move to a battlefield, you may move an enemy unit to that battlefield.",
  setId: "UNL",
};
