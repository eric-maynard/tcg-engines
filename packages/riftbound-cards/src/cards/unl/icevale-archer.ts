import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const icevaleArcher: UnitCard = {
  cardNumber: 65,
  cardType: "unit",
  domain: "mind",
  energyCost: 2,
  id: createCardId("unl-065-219"),
  might: 2,
  name: "Icevale Archer",
  rarity: "common",
  rulesText: "When I attack, you may pay [1] to give a unit here -1 [Might] this turn.",
  setId: "UNL",
};
