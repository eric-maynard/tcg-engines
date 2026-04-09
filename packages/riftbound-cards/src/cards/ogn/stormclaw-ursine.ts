import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const stormclawUrsine: UnitCard = {
  cardNumber: 137,
  cardType: "unit",
  domain: "body",
  energyCost: 7,
  id: createCardId("ogn-137-298"),
  might: 6,
  name: "Stormclaw Ursine",
  rarity: "common",
  rulesText:
    "[Tank] (I must be assigned combat damage first.)\nWhen you play me, channel 1 rune exhausted.",
  setId: "OGN",
};
