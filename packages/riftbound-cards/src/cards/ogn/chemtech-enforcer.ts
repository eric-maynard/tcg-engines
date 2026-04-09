import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const chemtechEnforcer: UnitCard = {
  cardNumber: 3,
  cardType: "unit",
  domain: "fury",
  energyCost: 2,
  id: createCardId("ogn-003-298"),
  might: 2,
  name: "Chemtech Enforcer",
  rarity: "common",
  rulesText: "[Assault 2] (+2 [Might] while I'm an attacker.)\nWhen you play me, discard 1.",
  setId: "OGN",
};
