import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const corruptEnforcer: UnitCard = {
  cardNumber: 123,
  cardType: "unit",
  domain: "chaos",
  energyCost: 3,
  id: createCardId("sfd-123-221"),
  might: 4,
  name: "Corrupt Enforcer",
  rarity: "common",
  rulesText: "When I move to a battlefield, discard 1.\nWhen I win a combat, draw 1.",
  setId: "SFD",
};
