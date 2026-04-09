import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const mountainDrake: UnitCard = {
  cardNumber: 142,
  cardType: "unit",
  domain: "body",
  energyCost: 9,
  id: createCardId("ogn-142-298"),
  might: 10,
  name: "Mountain Drake",
  rarity: "uncommon",
  setId: "OGN",
};
