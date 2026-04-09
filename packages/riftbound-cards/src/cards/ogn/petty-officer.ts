import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const pettyOfficer: UnitCard = {
  cardNumber: 215,
  cardType: "unit",
  domain: "order",
  energyCost: 5,
  id: createCardId("ogn-215-298"),
  might: 5,
  name: "Petty Officer",
  rarity: "common",
  rulesText: "[Assault] (+1 [Might] while I'm an attacker.)",
  setId: "OGN",
};
