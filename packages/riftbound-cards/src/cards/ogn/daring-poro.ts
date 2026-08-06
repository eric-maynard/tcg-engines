import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const daringPoro: UnitCard = {
  cardNumber: 210,
  cardType: "unit",
  domain: "order",
  energyCost: 2,
  id: createCardId("ogn-210-298"),
  might: 2,
  name: "Daring Poro",
  rarity: "common",
  rulesText: "[Assault] (+1 [Might] while I'm an attacker.)",
  setId: "OGN",
  tags: ["Poro"], // rule-id: unl-046-219 — printed PORO tag (missing from set data)
};
