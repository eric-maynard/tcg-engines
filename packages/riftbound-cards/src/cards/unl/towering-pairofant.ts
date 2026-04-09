import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const toweringPairofant: UnitCard = {
  cardNumber: 8,
  cardType: "unit",
  domain: "fury",
  energyCost: 6,
  id: createCardId("unl-008-219"),
  might: 6,
  name: "Towering Pairofant",
  rarity: "common",
  rulesText:
    "[Assault] (+1 [Might] while I'm an attacker.)\nIf a unit died this turn, I enter ready.",
  setId: "UNL",
};
