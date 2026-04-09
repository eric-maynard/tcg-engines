import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const overzealousFan: UnitCard = {
  cardNumber: 128,
  cardType: "unit",
  domain: "chaos",
  energyCost: 2,
  id: createCardId("sfd-128-221"),
  might: 2,
  name: "Overzealous Fan",
  rarity: "common",
  rulesText: "When I defend, you may kill me to move an attacking unit to its base.",
  setId: "SFD",
};
