import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const daringPoro: UnitCard = {
  cardNumber: 225,
  cardType: "unit",
  domain: "order",
  energyCost: 2,
  id: createCardId("unl-225-219"),
  might: 2,
  name: "Daring Poro",
  rarity: "common",
  rulesText: "[Assault] (+1 [Might] while I'm an attacker.)",
  setId: "UNL",
};
