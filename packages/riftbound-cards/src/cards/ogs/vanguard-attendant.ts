import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const vanguardAttendant: UnitCard = {
  cardNumber: 16,
  cardType: "unit",
  domain: "order",
  energyCost: 6,
  id: createCardId("ogs-016-024"),
  might: 5,
  name: "Vanguard Attendant",
  rarity: "common",
  rulesText: "I enter ready.",
  setId: "OGS",
};
