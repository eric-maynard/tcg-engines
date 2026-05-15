import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const veteranPoro: UnitCard = {
  cardNumber: 223,
  cardType: "unit",
  domain: "body",
  energyCost: 2,
  id: createCardId("unl-223-219"),
  might: 2,
  name: "Veteran Poro",
  rarity: "common",
  rulesText: "[Weaponmaster]",
  setId: "UNL",
};
