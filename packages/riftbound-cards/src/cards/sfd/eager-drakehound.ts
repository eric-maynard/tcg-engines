import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const eagerDrakehound: UnitCard = {
  cardNumber: 6,
  cardType: "unit",
  domain: "fury",
  energyCost: 3,
  id: createCardId("sfd-006-221"),
  might: 3,
  name: "Eager Drakehound",
  rarity: "common",
  rulesText: "I enter ready.",
  setId: "SFD",
};
