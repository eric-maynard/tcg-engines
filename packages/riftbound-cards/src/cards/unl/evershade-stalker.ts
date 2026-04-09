import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const evershadeStalker: UnitCard = {
  cardNumber: 123,
  cardType: "unit",
  domain: "chaos",
  energyCost: 3,
  id: createCardId("unl-123-219"),
  might: 3,
  name: "Evershade Stalker",
  rarity: "common",
  rulesText: "When you play me, discard 1, then draw 1.",
  setId: "UNL",
};
