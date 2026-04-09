import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const toweringCombatant: UnitCard = {
  cardNumber: 99,
  cardType: "unit",
  domain: "body",
  energyCost: 4,
  id: createCardId("unl-099-219"),
  might: 3,
  name: "Towering Combatant",
  rarity: "common",
  rulesText:
    "[Shield 2] (+2 [Might] while I'm a defender.)\n[Tank] (I must be assigned combat damage first.)",
  setId: "UNL",
};
