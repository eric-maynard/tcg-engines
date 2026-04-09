import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const duneDrake: UnitCard = {
  cardNumber: 131,
  cardType: "unit",
  domain: "body",
  energyCost: 5,
  id: createCardId("ogn-131-298"),
  might: 5,
  name: "Dune Drake",
  rarity: "common",
  rulesText: "When I attack, give me +2 [Might] this turn if there is a ready enemy unit here.",
  setId: "OGN",
};
